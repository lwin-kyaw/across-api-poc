import {
  Abi,
  Address,
  Chain,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  getContract,
  Hex,
  http,
  Log,
  parseAbi,
  parseUnits,
  publicActions,
  zeroAddress,
} from "viem";
import {
  FilledV3RelayEventArgs,
  SuggestedFeeQuote,
  V3FundsDepositedEventArgs,
} from "./types";
import {
  DESTINATION_CHAIN_TESTNET,
  DESTINATION_CHAIN_TESTNET_RPC,
  ORIGIN_CHAIN_TESTNET,
  ORIGIN_CHAIN_TESTNET_RPC,
  owner,
  PIMILICO_BUNDLER_TRANSPORT_URL,
  SPOKE_POOL_ADDRESS,
  W3P_TOKEN_ADDRESS,
  WRAPPED_NATIVE_TOKEN_ADDRESS,
} from "./config";
import { spokePoolAbi } from "@/abis/spokePoolAbi";
import { entryPoint07Address, SmartAccount } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";

export function getWalletClient(chain: Chain, rpc: string) {
  return createWalletClient({
    account: owner,
    transport: http(rpc),
    chain,
  }).extend(publicActions);
}

export function getSmartAccountClient(account: SmartAccount, chain: Chain) {
  const pimlicoPaymasterClient = createPimlicoClient({
    transport: http(PIMILICO_BUNDLER_TRANSPORT_URL),
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
  })

  const accountClient = createSmartAccountClient({
    account,
    chain,
    paymaster: pimlicoPaymasterClient,
    bundlerTransport: http(PIMILICO_BUNDLER_TRANSPORT_URL),
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoPaymasterClient.getUserOperationGasPrice()).fast,
    },
  });

  return accountClient;
}

export async function getWrappedNativeTokenBalance(
  chain: Chain,
  rpc: string,
  account: SmartAccount
) {
  const walletClient = getWalletClient(chain, rpc);
  const wethContract = getContract({
    address: WRAPPED_NATIVE_TOKEN_ADDRESS[chain.id],
    abi: erc20Abi,
    client: walletClient,
  });
  const balance = await wethContract.read.balanceOf([account.address]);
  return balance;
}

export async function wrapNativeToken(
  chain: Chain,
  rpc: string,
  account: SmartAccount,
  amount: bigint
) {
  const data = encodeFunctionData({
    abi: parseAbi(["function deposit()"]),
    functionName: "deposit",
  });

  const smartAccountClient = createSmartAccountClient({
    account,
    bundlerTransport: http(PIMILICO_BUNDLER_TRANSPORT_URL),
    chain,
  });
  const userOpHash = await smartAccountClient.sendUserOperation({
    callData: await account.encodeCalls([
      {
        to: WRAPPED_NATIVE_TOKEN_ADDRESS[chain.id],
        data,
        value: amount,
      },
    ]),
  });
  const userOpReceipt = await smartAccountClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log("userOpReceipt:", userOpReceipt);
}

// get the suggested fee quote for the deposit from the Across API
export async function getSuggestedFeeQuote(params: {
  acrossBaseUrl: string;
  originChainId: number;
  destinationChainId: number;
  amount: bigint;
  outputToken?: string;
  inputToken?: string;
  token?: Address;
  recipient?: Address;
  message?: Hex;
}): Promise<SuggestedFeeQuote> {
  const {
    acrossBaseUrl,
    originChainId,
    destinationChainId,
    amount,
    outputToken,
    inputToken,
    token,
    recipient,
    message,
  } = params;
  const quoteSuggestedFeeUrl = new URL(`${acrossBaseUrl}/suggested-fees`);
  quoteSuggestedFeeUrl.searchParams.set("skipAmountLimit", "true"); // skip amount limit check
  quoteSuggestedFeeUrl.searchParams.set(
    "originChainId",
    originChainId.toString()
  );
  quoteSuggestedFeeUrl.searchParams.set(
    "destinationChainId",
    destinationChainId.toString()
  );
  quoteSuggestedFeeUrl.searchParams.set("amount", amount.toString());

  if (token) {
    quoteSuggestedFeeUrl.searchParams.set("token", token);
  } else if (inputToken && outputToken) {
    quoteSuggestedFeeUrl.searchParams.set("inputToken", inputToken);
    quoteSuggestedFeeUrl.searchParams.set("outputToken", outputToken);
  } else {
    throw new Error(
      "Either token or inputToken and outputToken must be provided"
    );
  }

  if (recipient) {
    quoteSuggestedFeeUrl.searchParams.set("recipient", recipient);
  }

  if (message) {
    quoteSuggestedFeeUrl.searchParams.set("message", message);
  }

  const resp = await fetch(quoteSuggestedFeeUrl.toString());
  return (await resp.json()) as SuggestedFeeQuote;
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

  sendTransactionFunc: (
    from: Address,
    to: Address,
    data: Hex
  ) => Promise<string>;
}) {
  const {
    suggestedFeeQuote,
    destinationChainId,
    inputToken,
    outputToken: _outputToken,
    sendTransactionFunc,
  } = params;
  const depositor = owner.address;
  const recipient = params.recipient || owner.address;
  // The 0 address is resolved automatically to the equivalent supported
  // token on the the destination chain. Any other input/output token
  // combination should be advertised by the Across API available-routes
  // endpoint.
  const outputToken = _outputToken || zeroAddress;

  const inputAmount =
    params.inputAmount || BigInt(suggestedFeeQuote.totalRelayFee.total);
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

  const depositV3FunctionData = encodeFunctionData({
    abi: parseAbi([
      "function depositV3(address depositor,address recipient,address inputToken,address outputToken,uint256 inputAmount,uint256 outputAmount,uint256 destinationChainId,address exclusiveRelayer,uint32 quoteTimestamp,uint32 fillDeadline,uint32 exclusivityDeadline,bytes message)",
    ]),
    functionName: "depositV3",
    args: [
      depositor,
      recipient,
      inputToken,
      outputToken,
      inputAmount,
      outputAmount,
      BigInt(destinationChainId),
      exclusiveRelayer,
      quoteTimestamp,
      fillDeadline,
      exclusivityDeadline,
      message,
    ],
  });
  const depositTxHash = await sendTransactionFunc(
    owner.address,
    suggestedFeeQuote.spokePoolAddress,
    depositV3FunctionData
  );

  console.log(`depositTxHash: ${depositTxHash}`);
}

// subscribe to contract event and return the event args from the onLogs callback
export async function subscribeToContractEvent<T>(
  chain: Chain,
  rpc: string,
  contractAddress: Address,
  abi: Abi,
  eventName: string
): Promise<T> {
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
        console.error("error:", error);
        unwatch();
        reject(error);
      },
    });
  });
}

export function initEventSubscriptions(suggestedFeeQuote: SuggestedFeeQuote) {
  // init deposit event listener
  const v3DepositEventPromise =
    subscribeToContractEvent<V3FundsDepositedEventArgs>(
      ORIGIN_CHAIN_TESTNET,
      ORIGIN_CHAIN_TESTNET_RPC,
      suggestedFeeQuote.spokePoolAddress,
      spokePoolAbi as Abi,
      "V3FundsDeposited"
    );

  // we can track the deposit events in two ways:
  // 1. using Across API
  // 2. using destination chain event listener (used in this script)

  // track filled event, `FilledV3Relay`, on destination chain
  // when filled event (`FilledV3Relay`) is emitted, we can conclude that the deposit is filled on the destination chain and the recipient should have received funds
  const destinationSpokePoolAddress =
    suggestedFeeQuote.destinationSpokePoolAddress ||
    SPOKE_POOL_ADDRESS[DESTINATION_CHAIN_TESTNET.id];
  if (!destinationSpokePoolAddress) {
    throw new Error("destinationSpokePoolAddress is not set");
  }
  const filledV3RelayEventPromise =
    subscribeToContractEvent<FilledV3RelayEventArgs>(
      DESTINATION_CHAIN_TESTNET,
      DESTINATION_CHAIN_TESTNET_RPC,
      destinationSpokePoolAddress,
      spokePoolAbi as Abi,
      "FilledV3Relay"
    );

  return {
    v3DepositEventPromise,
    filledV3RelayEventPromise,
  };
}

// create message which includes the set of actions to be executed on the destination chain via multicall handler
export async function createMessageForMulticallHandler(recipient: Address) {
  const mintCalldata = encodeFunctionData({
    abi: parseAbi(["function mint(address to, uint256 amount)"]),
    functionName: "mint",
    args: [recipient, parseUnits("10", 6)],
  });

  return encodeAbiParameters(
    [
      {
        // Define the complex tuple type
        type: "tuple",
        components: [
          {
            // Inner array of action tuples
            type: "tuple[]",
            components: [
              { type: "address", name: "target" },
              { type: "bytes", name: "callData" },
              { type: "uint256", name: "value" },
            ],
          },
          { type: "address", name: "fallbackRecipient" },
        ],
      },
    ],
    [
      [
        [
          {
            target: W3P_TOKEN_ADDRESS,
            callData: mintCalldata,
            value: 0n,
          },
        ],
        "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      ],
    ]
  );
}
