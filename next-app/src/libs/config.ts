import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { Address, Hex } from 'viem';
import { mainnet, optimism, sepolia, arbitrumSepolia, baseSepolia, optimismSepolia } from 'viem/chains';

const PRIVATE_KEY = process.env.NEXT_PUBLIC_PRIVATE_KEY as Hex;
if (!PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY is not set');
}
if (!process.env.NEXT_PUBLIC_PIMLICO_API_KEY) {
  throw new Error('NEXT_PUBLIC_PIMLICO_API_KEY is not set');
}

export const owner = privateKeyToAccount(PRIVATE_KEY);

export const ACROSS_API_BASE_URL = 'https://app.across.to/api';
export const ACROSS_API_BASE_URL_TESTNET = 'https://testnet.across.to/api';

export const PIMILICO_BUNDLER_TRANSPORT_URL = `https://api.pimlico.io/v2/11155420/rpc?apikey=${process.env.NEXT_PUBLIC_PIMLICO_API_KEY}`;

export const ORIGIN_CHAIN_MAINNET = mainnet;
export const DESTINATION_CHAIN_MAINNET = optimism;
export const ORIGIN_CHAIN_RPC = 'http://127.0.0.1:8545';
export const DESTINATION_CHAIN_RPC = 'http://127.0.0.1:8546';

export const ORIGIN_CHAIN_TESTNET = optimismSepolia;
export const DESTINATION_CHAIN_TESTNET = baseSepolia;
export const ORIGIN_CHAIN_TESTNET_RPC = 'https://opt-sepolia.g.alchemy.com/v2/1Vtx0CZzowZcmXz4yjLU9YjIuzWvo757';
export const DESTINATION_CHAIN_TESTNET_RPC = 'https://base-sepolia.g.alchemy.com/v2/dZ1e8aGwQj3mIC1x8NK_D9JNZzwDAvf6';

export const W3P_TOKEN_ADDRESS = '0xe12349b2E35F6053Ed079E281427fc1F25b3C087';

export const WRAPPED_NATIVE_TOKEN_ADDRESS: Record<number, Address> = {
  [mainnet.id]: '0xC02aaA39b2C5E34D9C7d0F2DBd7532E396a02709',
  [optimism.id]: '0x4200000000000000000000000000000000000006',
  [sepolia.id]: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  [arbitrumSepolia.id]: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
  [baseSepolia.id]: '0x4200000000000000000000000000000000000006',
  [optimismSepolia.id]: '0x4200000000000000000000000000000000000006',
};

export const SPOKE_POOL_ADDRESS: Record<number, Address> = {
  [mainnet.id]: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
  [optimism.id]: '0x6f26Bf09B1C792e3228e5467807a900A503c0281',
  [sepolia.id]: '0x5ef6C01E11889d86803e0B23e3cB3F9E9d97B662',
  [arbitrumSepolia.id]: '0x7E63A5f1a8F0B4d0934B2f2327DAED3F6bb2ee75',
  [baseSepolia.id]: '0x82B564983aE7274c86695917BBf8C99ECb6F0F8F',
  [optimismSepolia.id]: '0x4e8E101924eDE233C13e2D8622DC8aED2872d505',
};

export const MULTICALL_HANDLER_ADDRESS: Record<number, Address> = {
  [mainnet.id]: '0x924a9f036260DdD5808007E1AA95f08eD08aA569',
  [optimism.id]: '0x924a9f036260DdD5808007E1AA95f08eD08aA569',
  [sepolia.id]: '0x924a9f036260DdD5808007E1AA95f08eD08aA569',
  [arbitrumSepolia.id]: '0x924a9f036260DdD5808007E1AA95f08eD08aA569',
  [baseSepolia.id]: '0x924a9f036260DdD5808007E1AA95f08eD08aA569',
  [optimismSepolia.id]: '0x924a9f036260DdD5808007E1AA95f08eD08aA569',
};
