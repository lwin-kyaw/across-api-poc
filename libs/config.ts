import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { Hex } from 'viem';
import { mainnet, optimism, baseSepolia, sepolia } from 'viem/chains';

const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;
if (!PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY is not set');
}

export const DEPOSIT_ID = process.env.DEPOSIT_ID; // to track deposit on origin chain
if (!DEPOSIT_ID) {
  throw new Error('DEPOSIT_ID is not set');
}

export const owner = privateKeyToAccount(PRIVATE_KEY);

export const ORIGIN_CHAIN_MAINNET = mainnet;
export const DESTINATION_CHAIN_MAINNET = optimism;
export const ORIGIN_CHAIN_RPC = 'http://127.0.0.1:8545';
export const DESTINATION_CHAIN_RPC = 'http://127.0.0.1:8546';

export const ORIGIN_CHAIN_TESTNET = sepolia;
export const DESTINATION_CHAIN_TESTNET = baseSepolia;
export const ORIGIN_CHAIN_TESTNET_RPC = 'https://eth-sepolia.g.alchemy.com/v2/dZ1e8aGwQj3mIC1x8NK_D9JNZzwDAvf6';
export const DESTINATION_CHAIN_TESTNET_RPC = 'https://base-sepolia.g.alchemy.com/v2/dZ1e8aGwQj3mIC1x8NK_D9JNZzwDAvf6';

export const SPOKE_POOL_ADDRESS = {
  [mainnet.id]: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
  [optimism.id]: '0x6f26Bf09B1C792e3228e5467807a900A503c0281',
  [sepolia.id]: '0x5ef6C01E11889d86803e0B23e3cB3F9E9d97B662',
  [baseSepolia.id]: '0x82B564983aE7274c86695917BBf8C99ECb6F0F8F',
}

