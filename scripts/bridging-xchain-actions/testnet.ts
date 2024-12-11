import { Abi, Address, parseEther } from "viem";
import { erc20Abi, getContract, Hex } from "viem";
import { ACROSS_API_BASE_URL_TESTNET, DESTINATION_CHAIN_TESTNET_2, ORIGIN_CHAIN_TESTNET_RPC, owner, WRAPPED_NATIVE_TOKEN_ADDRESS, DESTINATION_CHAIN_TESTNET_2_RPC, MULTICALL_HANDLER_ADDRESS, SPOKE_POOL_ADDRESS } from "../libs/config";
import { ORIGIN_CHAIN_TESTNET } from "../libs/config";
import { approveTokenSpending, createMintTestTokenMsgForMulticallHandler, getSuggestedFeeQuote, getWalletClient, initDepositV3, subscribeToContractEvent } from "../libs/utils";
import { spokePoolAbi } from "../abis/spokePoolAbi";
import { FilledV3RelayEventArgs, V3FundsDepositedEventArgs } from "../libs/types";

const acrossBaseUrl = ACROSS_API_BASE_URL_TESTNET;
const originChainId = ORIGIN_CHAIN_TESTNET.id;
const inputToken = WRAPPED_NATIVE_TOKEN_ADDRESS[originChainId];
const destinationChainId = DESTINATION_CHAIN_TESTNET_2.id;
const outputToken = WRAPPED_NATIVE_TOKEN_ADDRESS[destinationChainId];
const receiverAddress = owner.address;
const amount = parseEther('0.0001');


(async () => {
  const message = createMintTestTokenMsgForMulticallHandler(receiverAddress);
  
  const originWalletClient = getWalletClient(ORIGIN_CHAIN_TESTNET, ORIGIN_CHAIN_TESTNET_RPC);
  const multicallHandlerAddress = MULTICALL_HANDLER_ADDRESS[originChainId];

  const wethContract = getContract({
    address: inputToken,
    abi: erc20Abi,
    client: originWalletClient,
  });
  const wethBalance = await wethContract.read.balanceOf([owner.address]);
  console.log('wethBalance:', wethBalance);

  const suggestedFeeQuote = await getSuggestedFeeQuote({
    acrossBaseUrl,
    originChainId,
    destinationChainId,
    amount,
    message,
    inputToken,
    outputToken,
    recipient: multicallHandlerAddress,
  });
  console.log('suggestedFeeQuote:', suggestedFeeQuote);

  // init deposit event listener
  const v3DepositEventPromise = subscribeToContractEvent<V3FundsDepositedEventArgs>(
    ORIGIN_CHAIN_TESTNET,
    ORIGIN_CHAIN_TESTNET_RPC,
    suggestedFeeQuote.spokePoolAddress,
    spokePoolAbi as Abi,
    'V3FundsDeposited',
  );

  // we can track the deposit events in two ways:
  // 1. using Across API
  // 2. using destination chain event listener (used in this script)

  // track filled event, `FilledV3Relay`, on destination chain
  // when filled event (`FilledV3Relay`) is emitted, we can conclude that the deposit is filled on the destination chain and the recipient should have received funds
  const destinationSpokePoolAddress = SPOKE_POOL_ADDRESS[destinationChainId] as Address;
  if (!destinationSpokePoolAddress) {
    throw new Error('destinationSpokePoolAddress is not set');
  }
  const filledV3RelayEventPromise = subscribeToContractEvent<FilledV3RelayEventArgs>(
    DESTINATION_CHAIN_TESTNET_2,
    DESTINATION_CHAIN_TESTNET_2_RPC,
    destinationSpokePoolAddress,
    spokePoolAbi as Abi,
    'FilledV3Relay',
  );

  await initDepositV3({
    suggestedFeeQuote,
    destinationChainId,
    inputToken,
    inputAmount: amount,
    outputToken,
    // here, outputAmount should be the total relay fee and it will be used as fee to cover the action message execution on destination chain
    outputAmount: amount - BigInt(suggestedFeeQuote.totalRelayFee.total),
    recipient: multicallHandlerAddress,
    message,
    async requestTokenApprovalFunc(tokenAddress, spender, amount) {
      await approveTokenSpending(ORIGIN_CHAIN_TESTNET, ORIGIN_CHAIN_TESTNET_RPC, tokenAddress, spender, amount);
    },
    sendTransactionFunc: async (from, to, data) => {
      return await originWalletClient.sendTransaction({
        account: originWalletClient.account!,
        from,
        to,
        data,
        chain: ORIGIN_CHAIN_TESTNET,
      });
    },
  });

  const depositData = await v3DepositEventPromise;
  console.log('depositData:', depositData);
  const filledV3RelayEvent = await filledV3RelayEventPromise;
  console.log('filledV3RelayEvent:', filledV3RelayEvent);
})()