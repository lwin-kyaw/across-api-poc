import { Abi, Address, Chain, Client, createWalletClient, encodeAbiParameters, encodeFunctionData, erc20Abi, getContract, Hex, http, Log, parseAbi, parseUnits, publicActions, Transport, zeroAddress } from "viem";
import { DepositStatusData, SuggestedFeeQuote } from "./types";
import { owner, W3P_TOKEN_ADDRESS } from "./config";
import { waitForTransactionReceipt } from "viem/actions";
import { PublicActions } from "viem";

export function getWalletClient(chain: Chain, rpc: string): ReturnType<typeof createWalletClient> & PublicActions {
  return createWalletClient({
    account: owner,
    transport: http(rpc),
    chain,
  }).extend(publicActions);
}

export async function wrapNativeToken(chain: Chain, rpc: string, wethContractAddress: Address, amount: bigint) {
  const data = encodeFunctionData({
    abi: parseAbi(['function deposit()']),
    functionName: "deposit",
  });


  const walletClient = getWalletClient(chain, rpc);
  if (!walletClient.account) {
    throw new Error('wallet client account is undefined');
  }
  const txHash = await walletClient.sendTransaction({
    account: walletClient.account,
    to: wethContractAddress,
    data,
    value: amount,
    chain: chain,
  });

  const depositTxReceipt = await waitForTransactionReceipt(walletClient, { hash: txHash });
  if (depositTxReceipt.status !== "success") {
    throw new Error(`failed to wrapped native token. reason: ${depositTxReceipt}`);
  }

  return depositTxReceipt.transactionHash;
}

// get the suggested fee quote for the deposit from the Across API
export async function getSuggestedFeeQuote(params: {
  acrossBaseUrl: string,
  originChainId: number,
  destinationChainId: number,
  amount: bigint,
  outputToken?: string,
  inputToken?: string,
  token?: Address
  recipient?: Address
  message?: Hex
}): Promise<SuggestedFeeQuote> {
  const { acrossBaseUrl, originChainId, destinationChainId, amount, outputToken, inputToken, token, recipient, message } = params;
  const quoteSuggestedFeeUrl = new URL(`${acrossBaseUrl}/suggested-fees`);
  quoteSuggestedFeeUrl.searchParams.set('skipAmountLimit', 'true'); // skip amount limit check
  quoteSuggestedFeeUrl.searchParams.set('originChainId', originChainId.toString());
  quoteSuggestedFeeUrl.searchParams.set('destinationChainId', destinationChainId.toString());
  quoteSuggestedFeeUrl.searchParams.set('amount', amount.toString());

  if (token) {
    quoteSuggestedFeeUrl.searchParams.set('token', token);
  } else if (inputToken && outputToken) {
    quoteSuggestedFeeUrl.searchParams.set('inputToken', inputToken);
    quoteSuggestedFeeUrl.searchParams.set('outputToken', outputToken);
  } else {
    throw new Error('Either token or inputToken and outputToken must be provided');
  }

  if (recipient) {
    quoteSuggestedFeeUrl.searchParams.set('recipient', recipient);
  }

  if (message) {
    quoteSuggestedFeeUrl.searchParams.set('message', message);
  }

  const resp = await fetch(quoteSuggestedFeeUrl.toString());
  return await resp.json() as SuggestedFeeQuote;
}

export async function approveTokenSpending(chain: Chain, rpc: string, tokenAddress: Address, spender: Address, amount: bigint) {
  const walletClient = getWalletClient(chain, rpc);

  if (!walletClient.account) {
    throw new Error('wallet client account is undefined');
  }

  const txHash = await walletClient.sendTransaction({
    account: walletClient.account,
    to: tokenAddress,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, amount],
    }),
    chain,
  });

  await waitForTransactionReceipt(walletClient, {
    hash: txHash,
  });
}

// initiate deposit to the spoke pool on the origin chain
export async function initDepositV3(params: {
  suggestedFeeQuote: SuggestedFeeQuote;
  destinationChainId: number;
  inputToken: Address;
  inputAmount?: bigint;
  outputToken?: Address;
  outputAmount?: bigint;
  recipient?: Address;
  message?: Hex;

  requestTokenApprovalFunc: (tokenAddress: Address, spender: Address, amount: bigint) => Promise<void>;
  sendTransactionFunc: (from: Address, to: Address, data: Hex) => Promise<string>;
}) {
  const { suggestedFeeQuote, destinationChainId, inputToken, outputToken: _outputToken, requestTokenApprovalFunc, sendTransactionFunc } = params;
  const depositor = owner.address;
  const recipient = params.recipient || owner.address;
  // The 0 address is resolved automatically to the equivalent supported
  // token on the the destination chain. Any other input/output token
  // combination should be advertised by the Across API available-routes
  // endpoint.
  const outputToken = _outputToken || zeroAddress;

  const inputAmount = params.inputAmount || BigInt(suggestedFeeQuote.totalRelayFee.total);
  const outputAmount = params.outputAmount || inputAmount;
  const fillDeadlineBuffer = 18_000; // 5hrs
  const fillDeadline = Math.round(Date.now() / 1000) + fillDeadlineBuffer;

  // This should be _at least 2_ mainnet blocks behind the current time
  // for best service from relayers.
  const quoteTimestamp = Number(suggestedFeeQuote.timestamp);
  const exclusivityDeadline = suggestedFeeQuote.exclusivityDeadline;
  const exclusiveRelayer = suggestedFeeQuote.exclusiveRelayer;

  // No message will be executed post-fill on the destination chain.
  const message = params.message || "0x";

  // approve the spoke pool to spend the USDC
  await requestTokenApprovalFunc(inputToken, suggestedFeeQuote.spokePoolAddress, inputAmount);

  const depositV3FunctionData = encodeFunctionData({
    abi: parseAbi([
      'function depositV3(address depositor,address recipient,address inputToken,address outputToken,uint256 inputAmount,uint256 outputAmount,uint256 destinationChainId,address exclusiveRelayer,uint32 quoteTimestamp,uint32 fillDeadline,uint32 exclusivityDeadline,bytes message)'
    ]),
    functionName: 'depositV3',
    args: [depositor, recipient, inputToken, outputToken, inputAmount, outputAmount, BigInt(destinationChainId), exclusiveRelayer, quoteTimestamp, fillDeadline, exclusivityDeadline, message],
  });
  const depositTxHash = await sendTransactionFunc(owner.address, suggestedFeeQuote.spokePoolAddress, depositV3FunctionData);

  console.log(`depositTxHash: ${depositTxHash}`);
}

// subscribe to contract event and return the event args from the onLogs callback
export async function subscribeToContractEvent<T>(chain: Chain, rpc: string, contractAddress: Address, abi: Abi, eventName: string): Promise<T> {
  const walletClient = getWalletClient(chain, rpc);
  return new Promise((resolve, reject) => {
    const unwatch = walletClient.watchContractEvent({
      address: contractAddress,
      abi,
      eventName,
      poll: true,
      onLogs: (logs: (Log & { args?: T })[]) => {
        unwatch();
        resolve(logs[0].args as T);
      },
      onError: (error) => {
        console.error('error:', error);
        unwatch();
        reject(error);
      },
    });
  });
}

// track deposit status using Across API
export async function poolDepositStatusFromAcrossApi(baseUrl: string, originChainId: number, depositId: number): Promise<DepositStatusData | undefined> {
  const getDepositStatusUrl = new URL(`${baseUrl}/deposit/status`);
  getDepositStatusUrl.searchParams.set('depositId', depositId.toString());
  getDepositStatusUrl.searchParams.set('originChainId', originChainId.toString());

  let pollingCount = 0;
  let depositStatus: DepositStatusData | undefined;

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      pollingCount++;
  
      console.log('getDepositStatusUrl.toString()', getDepositStatusUrl.toString())

      const response = await fetch(getDepositStatusUrl.toString());
      const data = await response.json() as DepositStatusData;
  
      if (data.status === 'filled') {
        console.log('deposit filled on destination chain');
        depositStatus = data;
        clearInterval(interval);
        resolve(depositStatus);
      } else if (data.status === 'expired') {
        clearInterval(interval);
        reject(new Error('deposit expired'));
      }
  
      if (pollingCount > 10) {
        clearInterval(interval);
        reject(new Error('deposit status polling timeout'));
      }
  
    }, 2_000);
  });
}

// create message which includes the set of actions to be executed on the destination chain via multicall handler
export async function createMessageForMulticallHandler(
  recipient: Address,
  amount: bigint,
  outputToken: Address,
  tokenDecimals?: number,
) {
  const mintCalldata = encodeFunctionData({
    abi: parseAbi(['function mint(address to, uint256 amount)']),
    functionName: 'mint',
    args: [recipient, parseUnits('10', 6)],
  });

  return encodeAbiParameters(
    [
      {
        // Define the complex tuple type
        type: 'tuple',
        components: [
          {
            // Inner array of action tuples
            type: 'tuple[]',
            components: [
              { type: 'address', name: 'target' },
              { type: 'bytes', name: 'callData' },
              { type: 'uint256', name: 'value' }
            ]
          },
          { type: 'address', name: 'fallbackRecipient' }
        ]
      }
    ],
    [
      [
        [
          {
            target: W3P_TOKEN_ADDRESS,
            callData: mintCalldata, 
            value: 0n
          }
        ],
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      ]
    ]
  );
}
