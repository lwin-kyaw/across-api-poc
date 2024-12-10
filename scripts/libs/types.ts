import { Address, Hex } from "viem";

export type SuggestedFeeQuote = {
  estimatedFillTimeSec: number;
  spokePoolAddress: Address;
  timestamp: string;
  totalRelayFee: {
    total: string;
    pct: string;
  };
  exclusivityDeadline: number;
  exclusiveRelayer: Address;
};

export type V3FundsDepositedEventArgs = {
  destinationChainId: number;
  depositId: number;
  depositor: Address;
  recipient: Address;
  inputToken: Address;
  outputToken: Address;
  inputAmount: bigint;
  outputAmount: bigint;
  exclusiveRelayer: Address;
  exclusivityDeadline: number;
  fillDeadline: number;
  message: Hex;
  quoteTimestamp: number;
}

export type FilledV3RelayEventArgs = Omit<V3FundsDepositedEventArgs, 'destinationChainId'> & { originChainId: number };

export type FillStatus = 'pending' | 'filled' | 'expired';

export type DepositStatusData = {
  depositId: number;
  originChainId: number;
  destinationChainId: number;
  status: FillStatus;
  fillTx: Hex;
}
