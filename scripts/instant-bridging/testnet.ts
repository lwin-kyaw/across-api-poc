// fetching enabled routes for testnets from across api

import { Abi, Address, erc20Abi, getContract, parseEther } from "viem";
import { approveTokenSpending, getWalletClient, getSuggestedFeeQuote, initDepositV3, subscribeToContractEvent } from "../libs/utils";
import { ORIGIN_CHAIN_TESTNET, ORIGIN_CHAIN_TESTNET_RPC, owner, SPOKE_POOL_ADDRESS, ACROSS_API_BASE_URL_TESTNET, DESTINATION_CHAIN_TESTNET_2, DESTINATION_CHAIN_TESTNET_2_RPC, WRAPPED_NATIVE_TOKEN_ADDRESS } from "../libs/config";
import { spokePoolAbi } from "../abis/spokePoolAbi";
import { FilledV3RelayEventArgs, V3FundsDepositedEventArgs } from "../libs/types";

const acrossBaseUrl = ACROSS_API_BASE_URL_TESTNET;
const originChainId = ORIGIN_CHAIN_TESTNET.id;
const inputToken = WRAPPED_NATIVE_TOKEN_ADDRESS[originChainId];
const destinationChainId = DESTINATION_CHAIN_TESTNET_2.id;
const outputToken = WRAPPED_NATIVE_TOKEN_ADDRESS[destinationChainId];
const amount = parseEther('0.001');

(async () => {
  const originWalletClient = getWalletClient(ORIGIN_CHAIN_TESTNET, ORIGIN_CHAIN_TESTNET_RPC);

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
    inputToken,
    outputToken,
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

  console.log('Waiting for deposit & filled events...');

  const depositData = await v3DepositEventPromise;
  console.log('depositData:', depositData);
  const filledV3RelayEvent = await filledV3RelayEventPromise;
  console.log('filledV3RelayEvent:', filledV3RelayEvent);
})()
