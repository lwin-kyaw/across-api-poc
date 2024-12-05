import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { createTestClient, Hex, http } from 'viem';
import { mainnet, optimism } from 'viem/chains';
import { baseSepolia, foundry, sepolia } from 'viem/chains';

const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;
if (!PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY is not set');
}

export const DEPOSIT_ID = process.env.DEPOSIT_ID; // to track deposit on origin chain
if (!DEPOSIT_ID) {
  throw new Error('DEPOSIT_ID is not set');
}

export const owner = privateKeyToAccount(PRIVATE_KEY);

export const ORIGIN_CHAIN_TESTNET = sepolia;
export const DESTINATION_CHAIN_TESTNET = baseSepolia;
export const ORIGIN_CHAIN_LOCAL = mainnet;
export const DESTINATION_CHAIN_LOCAL = optimism;

export const ORIGIN_CHAIN_RPC = 'http://127.0.0.1:8545';
export const DESTINATION_CHAIN_RPC = 'http://127.0.0.1:8546';
// Top usdc holder on local network to fund USDC tokens to test account for testing
export const ORIGIN_USDC_HOLDER_ADDRESS = '0x4B16c5dE96EB2117bBE5fd171E4d203624B014aa';

export const originTestClient = createTestClient({
  chain: foundry,
  transport: http(ORIGIN_CHAIN_RPC),
  mode: 'anvil',
});
