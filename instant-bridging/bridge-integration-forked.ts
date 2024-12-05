import { encodeFunctionData, erc20Abi, getContract, parseEther, parseUnits } from "viem";
import { DESTINATION_CHAIN_LOCAL, ORIGIN_CHAIN_LOCAL, ORIGIN_USDC_HOLDER_ADDRESS, originTestClient, owner } from "../libs/config";
import { approveTokenSpendingForked, getSuggestedFeeQuote, initDeposit } from "../libs/utils";

const acrossBaseUrl = 'https://app.across.to/api';
const originChainId = ORIGIN_CHAIN_LOCAL.id;
const destinationChainId = DESTINATION_CHAIN_LOCAL.id;
const USDC_TOKEN_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const USDC_TOKEN_DECIMALS = 6;
const usdcContract = getContract({
  address: USDC_TOKEN_ADDRESS,
  abi: erc20Abi,
  client: originTestClient,
});

async function setUp() {
  await originTestClient.impersonateAccount({ address: ORIGIN_USDC_HOLDER_ADDRESS });

  // set some native balance to the USDC holder to cover the gas fees for token funding
  await originTestClient.setBalance({
    address: ORIGIN_USDC_HOLDER_ADDRESS,
    value: parseEther('1000'),
  });
  // transfer some USDC to the owner from the USDC holder account
  await originTestClient.sendUnsignedTransaction({
    from: ORIGIN_USDC_HOLDER_ADDRESS,
    to: USDC_TOKEN_ADDRESS,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [owner.address, parseUnits('1000', USDC_TOKEN_DECIMALS)],
    }),
  });

  await new Promise((resolve) => setTimeout(resolve, 5_000));

  // verify the USDC balance of the owner account
  const balance = await usdcContract.read.balanceOf([owner.address]);
  console.log(`balance: ${balance}`);
}

(async () => {
  // fund USDC to the owner account
  await setUp();

  // Request a suggested fee quote for the deposit
  const suggestedFeeQuote = await getSuggestedFeeQuote({
    acrossBaseUrl,
    originChainId,
    destinationChainId,
    amount: parseUnits('1', USDC_TOKEN_DECIMALS),
    token: USDC_TOKEN_ADDRESS,
  });

  await initDeposit({
    suggestedFeeQuote,
    destinationChainId,
    inputToken: USDC_TOKEN_ADDRESS,
    requestTokenApprovalFunc: approveTokenSpendingForked,
  });
})();
