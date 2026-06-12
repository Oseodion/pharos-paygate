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
import { pharosAtlantic, RPC_URL } from "../config/pharos.js";

let publicClient: PublicClient | undefined;
let walletClient: (WalletClient<Transport, Chain, Account>) | undefined;

/**
 * Get (or lazily create) the shared viem public client for reads.
 * @returns A viem PublicClient connected to Pharos Atlantic
 */
export function getPublicClient(): PublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: pharosAtlantic,
      transport: http(RPC_URL),
    });
  }
  return publicClient;
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
 * transactions, signed with the PRIVATE_KEY from the environment.
 * @throws If PRIVATE_KEY is missing or malformed
 * @returns A viem WalletClient connected to Pharos Atlantic
 */
export function getWalletClient(): WalletClient<Transport, Chain, Account> {
  if (!walletClient) {
    walletClient = createWalletClient({
      account: getAccount(),
      chain: pharosAtlantic,
      transport: http(RPC_URL),
    });
  }
  return walletClient;
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
