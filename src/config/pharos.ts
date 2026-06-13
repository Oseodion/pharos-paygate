import { defineChain, type Chain } from "viem";
import * as dotenv from "dotenv";

dotenv.config();

/** Selectable network for every tool. */
export type Network = "testnet" | "mainnet";

// ---------------------------------------------------------------------------
// Pharos Atlantic Testnet (default)
// ---------------------------------------------------------------------------

/** RPC URL for the Pharos Atlantic Testnet. Overridable via env. */
export const RPC_URL = process.env.RPC_URL ?? "https://atlantic.dplabs-internal.com";

/** Chain ID for the Pharos Atlantic Testnet. */
export const CHAIN_ID = Number(process.env.CHAIN_ID ?? 688689);

/** Block explorer base URL for the Pharos Atlantic Testnet. */
export const EXPLORER_URL = "https://atlantic.pharosscan.xyz";

/** Explorer API base for testnet transaction history lookups. */
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

/** Alias matching the testnet/mainnet naming convention. */
export const pharosTestnet = pharosAtlantic;

// ---------------------------------------------------------------------------
// Pharos Pacific Mainnet
// ---------------------------------------------------------------------------

/** RPC URL for the Pharos Pacific Mainnet. Overridable via env. */
export const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL ?? "https://rpc.pharos.xyz";

/** Block explorer base URL for the Pharos Pacific Mainnet. */
export const MAINNET_EXPLORER_URL = "https://www.pharosscan.xyz";

/** Explorer API base for mainnet transaction history lookups. */
export const MAINNET_EXPLORER_API_URL = "https://www.pharosscan.xyz/api";

/** Chain ID for the Pharos Pacific Mainnet. */
export const MAINNET_CHAIN_ID = 1672;

/**
 * Pharos Pacific Mainnet chain definition for viem.
 */
export const pharosMainnet = defineChain({
  id: MAINNET_CHAIN_ID,
  name: "Pharos Pacific Mainnet",
  nativeCurrency: {
    name: "Pharos",
    symbol: "PROS",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [MAINNET_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "PharosScan", url: MAINNET_EXPLORER_URL },
  },
  contracts: {
    multicall3: {
      address: MULTICALL3_ADDRESS,
    },
  },
});

// ---------------------------------------------------------------------------
// Token registries
// ---------------------------------------------------------------------------

/** Shape of a supported ERC20 token entry. */
export interface TokenInfo {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  /** CoinGecko ID for pricing, or null when not listed. */
  coingeckoId?: string | null;
}

/**
 * Supported ERC20 tokens on Pharos Atlantic Testnet.
 * PHRS is the native gas token and is handled separately.
 */
export const TESTNET_TOKENS: Record<string, TokenInfo> = {
  USDC: {
    symbol: "USDC",
    address: "0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  USDT: {
    symbol: "USDT",
    address: "0xE7E84B8B4f39C507499c40B4ac199B050e2882d5",
    decimals: 6,
    coingeckoId: "tether",
  },
  WETH: {
    symbol: "WETH",
    address: "0x7d211F77525ea39A0592794f793cC1036eEaccD5",
    decimals: 18,
    coingeckoId: "ethereum",
  },
  WPHRS: {
    symbol: "WPHRS",
    address: "0x838800b758277CC111B2d48Ab01e5E164f8E9471",
    decimals: 18,
    coingeckoId: null,
  },
};

/**
 * Supported ERC20 tokens on Pharos Pacific Mainnet.
 * PROS is the native gas token and is handled separately.
 */
export const MAINNET_TOKENS: Record<string, TokenInfo> = {
  USDC: {
    symbol: "USDC",
    address: "0xc879c018db60520f4355c26ed1a6d572cdac1815",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  WETH: {
    symbol: "WETH",
    address: "0x1f4b7011Ee3d53969bb67F59428a9ec0477856E9",
    decimals: 18,
    coingeckoId: "ethereum",
  },
  WPROS: {
    symbol: "WPROS",
    address: "0x52c48d4213107b20bc583832b0d951fb9ca8f0b0",
    decimals: 18,
    coingeckoId: null,
  },
  LINK: {
    symbol: "LINK",
    address: "0x51e2A24742Db77604B881d6781Ee16B5b8fcBE29",
    decimals: 18,
    coingeckoId: "chainlink",
  },
};

/**
 * Backward-compatible alias for the testnet token map. Existing tools
 * that imported `TOKENS` continue to resolve testnet tokens.
 */
export const TOKENS: Record<string, TokenInfo> = TESTNET_TOKENS;

// ---------------------------------------------------------------------------
// Network resolution
// ---------------------------------------------------------------------------

/** Fully resolved configuration for one network. */
export interface NetworkConfig {
  network: Network;
  chain: Chain;
  tokens: Record<string, TokenInfo>;
  explorer: string;
  explorerApi: string;
  chainId: number;
  networkName: string;
  nativeSymbol: string;
  /** Symbol of the wrapped-native token in `tokens` (WPHRS or WPROS). */
  wrappedNativeSymbol: string;
  rpcUrl: string;
  facilitatorNetwork: `eip155:${number}`;
}

/**
 * Resolve a network name, falling back to the NETWORK env var and then
 * to "testnet".
 * @param network Optional explicit network
 * @returns The resolved network name
 */
export function resolveNetwork(network?: Network): Network {
  return network ?? (process.env.NETWORK as Network) ?? "testnet";
}

/**
 * Return the chain, token registry, explorer, and identifiers for the
 * requested network. Defaults to testnet for full backward
 * compatibility when no network is supplied.
 * @param network Optional network ("testnet" | "mainnet")
 * @returns The resolved NetworkConfig
 */
export function getNetworkConfig(network?: Network): NetworkConfig {
  const resolved = resolveNetwork(network);
  if (resolved === "mainnet") {
    return {
      network: "mainnet",
      chain: pharosMainnet,
      tokens: MAINNET_TOKENS,
      explorer: MAINNET_EXPLORER_URL,
      explorerApi: MAINNET_EXPLORER_API_URL,
      chainId: MAINNET_CHAIN_ID,
      networkName: "Pharos Pacific Mainnet",
      nativeSymbol: "PROS",
      wrappedNativeSymbol: "WPROS",
      rpcUrl: MAINNET_RPC_URL,
      facilitatorNetwork: `eip155:${MAINNET_CHAIN_ID}`,
    };
  }
  return {
    network: "testnet",
    chain: pharosTestnet,
    tokens: TESTNET_TOKENS,
    explorer: EXPLORER_URL,
    explorerApi: EXPLORER_API_URL,
    chainId: CHAIN_ID,
    networkName: "Pharos Atlantic Testnet",
    nativeSymbol: "PHRS",
    wrappedNativeSymbol: "WPHRS",
    rpcUrl: RPC_URL,
    facilitatorNetwork: `eip155:${CHAIN_ID}`,
  };
}

// ---------------------------------------------------------------------------
// ABIs and pricing
// ---------------------------------------------------------------------------

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

/** WETH-style wrapper ABI for the WPHRS / WPROS contracts (deposit/withdraw). */
export const WPHRS_ABI = [
  { name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** GoPlus Security API base URL (free tier, no API key required). */
export const GOPLUS_API_URL = "https://api.gopluslabs.io/api/v1";

/**
 * Map of supported token symbols to CoinGecko API IDs.
 * PHRS / PROS are not listed on CoinGecko, so they have no entry here and
 * callers fall back to a fixed $0.10 estimate.
 */
export const COINGECKO_IDS: Record<string, string> = {
  USDC: "usd-coin",
  USDT: "tether",
  WETH: "ethereum",
  LINK: "chainlink",
};

/** Fallback USD price used for PHRS / PROS since they are not listed on CoinGecko. */
export const PHRS_PRICE_ESTIMATE_USD = 0.1;

/**
 * Build an explorer link for a transaction hash on the given network.
 * @param hash Transaction hash
 * @param network Optional network (defaults to testnet)
 * @returns Full URL to the transaction on PharosScan
 */
export function explorerTxLink(hash: string, network?: Network): string {
  return `${getNetworkConfig(network).explorer}/tx/${hash}`;
}
