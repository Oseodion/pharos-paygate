import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Account,
  type Chain,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getNetworkConfig, resolveNetwork, type Network } from "../config/pharos.js";

const publicClients = new Map<Network, PublicClient>();
const walletClients = new Map<Network, WalletClient<Transport, Chain, Account>>();

/**
 * Get (or lazily create) the shared viem public client for reads on the
 * given network. Clients are cached per network; omitting the network
 * keeps the original testnet default behavior.
 * @param network Optional network ("testnet" | "mainnet")
 * @returns A viem PublicClient connected to the resolved network
 */
export function getPublicClient(network?: Network): PublicClient {
  const resolved = resolveNetwork(network);
  let client = publicClients.get(resolved);
  if (!client) {
    const { chain, rpcUrl } = getNetworkConfig(resolved);
    client = createPublicClient({ chain, transport: http(rpcUrl) });
    publicClients.set(resolved, client);
  }
  return client;
}

/**
 * Get the account derived from the PRIVATE_KEY environment variable.
 * @throws If PRIVATE_KEY is missing or malformed
 * @returns A viem Account for signing transactions
 */
export function getAccount(): Account {
  const key = process.env.PRIVATE_KEY;
  if (!key || key === "your_wallet_private_key_here") {
    throw new Error(
      "PRIVATE_KEY is not set. Add it to your .env file or MCP server env config."
    );
  }
  const normalized = (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
  return privateKeyToAccount(normalized);
}

/**
 * Get (or lazily create) the shared viem wallet client for sending
 * transactions on the given network, signed with the PRIVATE_KEY from
 * the environment. Clients are cached per network; omitting the network
 * keeps the original testnet default behavior.
 * @param network Optional network ("testnet" | "mainnet")
 * @throws If PRIVATE_KEY is missing or malformed
 * @returns A viem WalletClient connected to the resolved network
 */
export function getWalletClient(network?: Network): WalletClient<Transport, Chain, Account> {
  const resolved = resolveNetwork(network);
  let client = walletClients.get(resolved);
  if (!client) {
    const { chain, rpcUrl } = getNetworkConfig(resolved);
    client = createWalletClient({
      account: getAccount(),
      chain,
      transport: http(rpcUrl),
    });
    walletClients.set(resolved, client);
  }
  return client;
}

/** Standard result envelope returned by every tool. */
export interface ToolResult<T = unknown> {
  success: boolean;
  data: T | null;
  error?: string;
}

/**
 * Build a success result envelope.
 * @param data Payload to return to the agent
 */
export function ok<T>(data: T): ToolResult<T> {
  return { success: true, data };
}

/**
 * Build a failure result envelope.
 * @param error Human readable error message
 */
export function fail(error: unknown): ToolResult<null> {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
  return { success: false, data: null, error: message };
}
