import { Abi, parseUnits } from "viem";
import { DESTINATION_CHAIN_MAINNET, ORIGIN_CHAIN_MAINNET, ORIGIN_CHAIN_RPC, } from "../libs/config";
import { poolDepositStatusFromAcrossApi, getWalletClient, getSuggestedFeeQuote, initDeposit, wrapNativeToken, approveTokenSpending, subscribeToContractEvent } from "../libs/utils";
import { V3FundsDepositedEventArgs } from "../libs/types";
import { spokePoolAbi } from "../abis/spokePoolAbi";

const acrossBaseUrl = 'https://app.across.to/api';
const originChainId = ORIGIN_CHAIN_MAINNET.id;
const destinationChainId = DESTINATION_CHAIN_MAINNET.id;
const inputToken = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const inputTokenDecimals = 18;
const outputToken = '0x4200000000000000000000000000000000000006';

(async () => {
  await wrapNativeToken(ORIGIN_CHAIN_MAINNET, ORIGIN_CHAIN_RPC, inputToken, parseUnits('1', inputTokenDecimals));

  // Request a suggested fee quote for the deposit
  const suggestedFeeQuote = await getSuggestedFeeQuote({
    acrossBaseUrl,
    originChainId,
    destinationChainId,
    amount: parseUnits('1', inputTokenDecimals),
    inputToken,
    outputToken,
  });

  // init deposit event listener
  const originWalletClient = getWalletClient(ORIGIN_CHAIN_MAINNET, ORIGIN_CHAIN_RPC);
  const v3DepositEventPromise = subscribeToContractEvent<V3FundsDepositedEventArgs>(
    ORIGIN_CHAIN_MAINNET,
    ORIGIN_CHAIN_RPC,
    suggestedFeeQuote.spokePoolAddress,
    spokePoolAbi as Abi,
    'V3FundsDeposited',
  );

  // we can track the deposit events in two ways:
  // 1. using Across API (later in this script)
  // 2. using destination chain event listener

  // initiate deposit
  await initDeposit({
    suggestedFeeQuote,
    destinationChainId,
    inputToken,
    async requestTokenApprovalFunc(tokenAddress, spender, amount) {
      await approveTokenSpending(ORIGIN_CHAIN_MAINNET, ORIGIN_CHAIN_RPC, tokenAddress, spender, amount);
    },
    sendTransactionFunc: async (from, to, data) => {
      return await originWalletClient.sendTransaction({
        from,
        to,
        data,
      });
    },
  });

  console.log('Waiting for deposit event...');
  const depositData = await v3DepositEventPromise;

  // track deposit status using Across API
  // when apiResponse.fillStatus is 'filled', we can conclude that the deposit is filled on the destination chain and the recipient should have received funds
  const depositStatusFromAcrossApi = await poolDepositStatusFromAcrossApi(acrossBaseUrl, originChainId, depositData.depositId);
  console.log('depositStatusFromAcrossApi:', depositStatusFromAcrossApi);
  if (!depositStatusFromAcrossApi) {
    throw new Error('Timeout waiting for deposit status');
  }
})();
