import { defineChain } from "viem";
import * as dotenv from "dotenv";

dotenv.config();

/** RPC URL for the Pharos Atlantic Testnet. Overridable via env. */
export const RPC_URL = process.env.RPC_URL ?? "https://atlantic.dplabs-internal.com";

/** Chain ID for the Pharos Atlantic Testnet. */
export const CHAIN_ID = Number(process.env.CHAIN_ID ?? 688689);

/** Block explorer base URL for the Pharos Atlantic Testnet. */
export const EXPLORER_URL = "https://atlantic.pharosscan.xyz";

/** Explorer API base for transaction history lookups. */
export const EXPLORER_API_URL = "https://atlantic.pharosscan.xyz/api";

/** x402 facilitator endpoint used to settle x402 payments. */
export const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";

/** MultiCall3 deployment on Pharos Atlantic, used for batched reads. */
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/** Test USDC contract used by the x402 protocol on Pharos Atlantic. */
export const X402_USDC_ADDRESS = "0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8" as const;

/**
 * Pharos Atlantic Testnet chain definition for viem.
 */
export const pharosAtlantic = defineChain({
  id: CHAIN_ID,
  name: "Pharos Atlantic Testnet",
  nativeCurrency: {
    name: "Pharos",
    symbol: "PHRS",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "PharosScan", url: EXPLORER_URL },
  },
  contracts: {
    multicall3: {
      address: MULTICALL3_ADDRESS,
    },
  },
  testnet: true,
});

/** Shape of a supported ERC20 token entry. */
export interface TokenInfo {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
}

/**
 * Supported ERC20 tokens on Pharos Atlantic Testnet.
 * PHRS is the native gas token and is handled separately.
 */
export const TOKENS: Record<string, TokenInfo> = {
  USDC: {
    symbol: "USDC",
    address: "0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B",
    decimals: 6,
  },
  USDT: {
    symbol: "USDT",
    address: "0xE7E84B8B4f39C507499c40B4ac199B050e2882d5",
    decimals: 6,
  },
  WETH: {
    symbol: "WETH",
    address: "0x7d211F77525ea39A0592794f793cC1036eEaccD5",
    decimals: 18,
  },
  WPHRS: {
    symbol: "WPHRS",
    address: "0x838800b758277CC111B2d48Ab01e5E164f8E9471",
    decimals: 18,
  },
};

/** Minimal ERC20 ABI covering everything the tools need. */
export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

/**
 * Map of supported token symbols to CoinGecko API IDs.
 * PHRS is not listed on CoinGecko, so it has no entry here and callers
 * fall back to a fixed $0.10 estimate.
 */
export const COINGECKO_IDS: Record<string, string> = {
  USDC: "usd-coin",
  USDT: "tether",
  WETH: "ethereum",
};

/** Fallback USD price used for PHRS since it is not listed on CoinGecko. */
export const PHRS_PRICE_ESTIMATE_USD = 0.1;

/**
 * Build an explorer link for a transaction hash.
 * @param hash Transaction hash
 * @returns Full URL to the transaction on PharosScan
 */
export function explorerTxLink(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}
