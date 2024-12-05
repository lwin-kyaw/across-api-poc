// fetching enabled routes for testnets from across api

import { parseEther } from "viem";
import { approveTokenSpendingTestnet, getSuggestedFeeQuote, initDeposit } from "../libs/utils";
import { ORIGIN_CHAIN_TESTNET, DESTINATION_CHAIN_TESTNET } from "../libs/config";

const baseUrl = 'https://testnet.across.to/api';
const originChainId = ORIGIN_CHAIN_TESTNET.id;
const inputToken = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const destinationChainId = DESTINATION_CHAIN_TESTNET.id;
const outputToken = '0x4200000000000000000000000000000000000006';
const amount = parseEther('0.001');

(async () => {
  const suggestedFeeQuote = await getSuggestedFeeQuote({
    acrossBaseUrl: baseUrl,
    originChainId,
    destinationChainId,
    amount,
    inputToken,
    outputToken,
  });

  await initDeposit({
    suggestedFeeQuote,
    destinationChainId,
    inputToken,
    outputToken,
    requestTokenApprovalFunc: approveTokenSpendingTestnet,
  });
})()
