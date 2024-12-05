import { Address } from "viem";

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
