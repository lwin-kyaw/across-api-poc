import { Address, createWalletClient, encodeFunctionData, erc20Abi, getContract, http, parseAbi, zeroAddress } from "viem";
import { SuggestedFeeQuote } from "./types";
import { ORIGIN_CHAIN_TESTNET, ORIGIN_CHAIN_RPC, originTestClient } from "./config";
import { owner } from "./config";
import { waitForTransactionReceipt } from "viem/actions";

export async function getSuggestedFeeQuote(params: {
  acrossBaseUrl: string,
  originChainId: number,
  destinationChainId: number,
  amount: bigint,
  outputToken?: string,
  inputToken?: string,
  token?: Address
}): Promise<SuggestedFeeQuote> {
  const { acrossBaseUrl, originChainId, destinationChainId, amount, outputToken, inputToken, token } = params;
  const quoteSuggestedFeeUrl = new URL(`${acrossBaseUrl}/suggested-fees`);
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

  const resp = await fetch(quoteSuggestedFeeUrl.toString());
  return await resp.json() as SuggestedFeeQuote;
}

export async function approveTokenSpendingForked(tokenAddress: Address, spender: Address, amount: bigint) {
  const usdcContract = getContract({
    address: tokenAddress,
    abi: erc20Abi,
    client: originTestClient,
  });

  // approve the spoke pool to spend the USDC with test client
  await originTestClient.sendUnsignedTransaction({
    from: owner.address,
    to: tokenAddress,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, amount],
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 5_000));

  // verify the allowance
  const allowance = await usdcContract.read.allowance([owner.address, spender]);
  console.log(`allowance: ${allowance}`);
}

export async function approveTokenSpendingTestnet(tokenAddress: Address, spender: Address, amount: bigint) {
  const walletClient = createWalletClient({
    account: owner,
    transport: http(ORIGIN_CHAIN_RPC),
    chain: ORIGIN_CHAIN_TESTNET
  });

  const txHash = await walletClient.sendTransaction({
    to: tokenAddress,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, amount],
    }),
  });
  console.log(`txHash: ${txHash}`);

  const receipt = await waitForTransactionReceipt(walletClient, {
    hash: txHash,
  });
  console.log('receipt:', receipt);
}

export async function initDeposit(params: {
  suggestedFeeQuote: SuggestedFeeQuote;
  destinationChainId: number;
  inputToken: Address;
  outputToken?: Address;

  requestTokenApprovalFunc: (tokenAddress: Address, spender: Address, amount: bigint) => Promise<void>;
}) {
  const { suggestedFeeQuote, destinationChainId, inputToken, outputToken: _outputToken, requestTokenApprovalFunc } = params;
  const depositor = owner.address;
  const recipient = owner.address;
  // The 0 address is resolved automatically to the equivalent supported
  // token on the the destination chain. Any other input/output token
  // combination should be advertised by the Across API available-routes
  // endpoint.
  const outputToken = _outputToken || zeroAddress;

  const inputAmount = BigInt(suggestedFeeQuote.totalRelayFee.total);
  const outputAmount = inputAmount;
  const fillDeadlineBuffer = 18_000; // 5hrs
  const fillDeadline = Math.round(Date.now() / 1000) + fillDeadlineBuffer;

  // This should be _at least 2_ mainnet blocks behind the current time
  // for best service from relayers.
  const quoteTimestamp = Number(suggestedFeeQuote.timestamp);
  const exclusivityDeadline = suggestedFeeQuote.exclusivityDeadline;
  const exclusiveRelayer = suggestedFeeQuote.exclusiveRelayer;

  // No message will be executed post-fill on the destination chain.
  const message = "0x";

  // approve the spoke pool to spend the USDC
  await requestTokenApprovalFunc(inputToken, suggestedFeeQuote.spokePoolAddress, inputAmount);

  const depositV3FunctionData = encodeFunctionData({
    abi: parseAbi([
      'function depositV3(address depositor,address recipient,address inputToken,address outputToken,uint256 inputAmount,uint256 outputAmount,uint256 destinationChainId,address exclusiveRelayer,uint32 quoteTimestamp,uint32 fillDeadline,uint32 exclusivityDeadline,bytes message)'
    ]),
    functionName: 'depositV3',
    args: [depositor, recipient, inputToken, outputToken, inputAmount, outputAmount, BigInt(destinationChainId), exclusiveRelayer, quoteTimestamp, fillDeadline, exclusivityDeadline, message],
  });
  const depositTxHash = await originTestClient.sendUnsignedTransaction({
    from: owner.address,
    to: suggestedFeeQuote.spokePoolAddress,
    data: depositV3FunctionData,
  });

  console.log(`depositTxHash: ${depositTxHash}`);
}
