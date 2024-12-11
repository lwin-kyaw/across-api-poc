"use client";

import { useEffect, useState } from "react";
import { toKernelSmartAccount } from "permissionless/accounts";
import { ACROSS_API_BASE_URL_TESTNET, DESTINATION_CHAIN_TESTNET, ORIGIN_CHAIN_TESTNET_RPC, owner, WRAPPED_NATIVE_TOKEN_ADDRESS } from "@/libs/config";
import { ORIGIN_CHAIN_TESTNET } from "@/libs/config";
import { createTokenApprovalCall, getSmartAccountClient, getSuggestedFeeQuote, getWalletClient, getWrappedNativeTokenBalance, initDepositV3, initEventSubscriptions } from "@/libs/utils";
import { SmartAccount } from "viem/account-abstraction";
import { Address, Hex, parseEther } from "viem";

export default function Ecdsa() {
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<SmartAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function crossChainLiquidityTransfer() {
    if (!account) {
      setError('Account is not initialized');
      return;
    }
    const amount = parseEther('0.00001');
    setLoading(true);

    try {
      const wethBalance = await getWrappedNativeTokenBalance(ORIGIN_CHAIN_TESTNET, ORIGIN_CHAIN_TESTNET_RPC, account);
      if (wethBalance < amount) {
        // TODO: wrap native token
        throw new Error('Insufficient balance');
      }

      const suggestedFeeQuote = await getSuggestedFeeQuote({
        acrossBaseUrl: ACROSS_API_BASE_URL_TESTNET,
        originChainId: ORIGIN_CHAIN_TESTNET.id,
        destinationChainId: DESTINATION_CHAIN_TESTNET.id,
        amount,
        inputToken: WRAPPED_NATIVE_TOKEN_ADDRESS[ORIGIN_CHAIN_TESTNET.id],
        outputToken: WRAPPED_NATIVE_TOKEN_ADDRESS[DESTINATION_CHAIN_TESTNET.id],
        recipient: account.address,
      });
      console.log('suggestedFeeQuote:', suggestedFeeQuote);

      // init event subscriptions
      const { v3DepositEventPromise, filledV3RelayEventPromise } = initEventSubscriptions(suggestedFeeQuote);

      await initDepositV3({
        depositor: account.address,
        suggestedFeeQuote,
        destinationChainId: DESTINATION_CHAIN_TESTNET.id,
        inputToken: WRAPPED_NATIVE_TOKEN_ADDRESS[ORIGIN_CHAIN_TESTNET.id],
        inputAmount: amount,
        outputToken: WRAPPED_NATIVE_TOKEN_ADDRESS[DESTINATION_CHAIN_TESTNET.id],
        sendTransactionFunc: async (from: Address, to: Address, data: Hex) => {
          const accountClient = getSmartAccountClient(account, ORIGIN_CHAIN_TESTNET);
          // create spending approval calldata
          const tokenApprovalCall = createTokenApprovalCall(WRAPPED_NATIVE_TOKEN_ADDRESS[ORIGIN_CHAIN_TESTNET.id], suggestedFeeQuote.spokePoolAddress, amount);
          const depositV3Call = { to, data };

          return await accountClient.sendUserOperation({
              callData: await account.encodeCalls([tokenApprovalCall, depositV3Call]),
          });
        },
      });

      console.log('Waiting for deposit & filled events...');

      const depositData = await v3DepositEventPromise;
      console.log('depositData:', depositData);
      const filledV3RelayEvent = await filledV3RelayEventPromise;
      console.log('filledV3RelayEvent:', filledV3RelayEvent);
    } catch (e) {
      console.error(e);
      setError("Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function crossChainActionsExecution() {
    console.log("crossChainActionsExecution");
  }

  useEffect(() => {
    if (account || loading) {
      return;
    }
    setLoading(true);

    (async () => {
      try {
        const client = getWalletClient(
          ORIGIN_CHAIN_TESTNET,
          ORIGIN_CHAIN_TESTNET_RPC
        );
        const account = await toKernelSmartAccount({
          client,
          owners: [owner],
        });
        console.log(account);
        setAccount(account);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, [account]);

  return (
    <div className="flex flex-col gap-4">
      {account && (
        <>
          <div className="text-sm bg-green-500 font-bold text-white px-4 py-2 rounded-md">
            Account: {account.address}
          </div>
          <div className="flex gap-4">
            <button
              className="bg-blue-500 text-sm font-bold text-white px-4 py-2 rounded-md"
              onClick={crossChainLiquidityTransfer}
            >
              Cross-chain liquidity transfer
            </button>
            <button
              className="bg-blue-500 text-sm font-bold text-white px-4 py-2 rounded-md"
              onClick={crossChainActionsExecution}
            >
              Cross-chain actions execution
            </button>
          </div>
        </>
      )}
      {error && <div className="text-red-500">{error}</div>}
      {loading && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
          <div className="text-sm font-bold text-white px-4 py-2 rounded-md">
            Loading...
          </div>
        </div>
      )}
    </div>
  );
}
