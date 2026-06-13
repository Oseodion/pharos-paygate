import { z } from "zod";
import { formatUnits, isAddress } from "viem";
import { getNetworkConfig, type Network } from "../config/pharos.js";
import { ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for get_transaction_history. */
export const getTransactionHistorySchema = {
  address: z.string().describe("Wallet address to fetch history for"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Number of transactions to return (default 10, max 50)"),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/** One normalized explorer transaction, shared with verify_payment_received. */
export interface HistoryEntry {
  hash: string;
  from: string;
  to: string;
  value: string;
  token: string;
  timestamp: string;
  status: string;
}

/**
 * Normalize one raw explorer transaction into the skill's history shape.
 * Handles both Etherscan-style (txlist) and Blockscout-style fields.
 * @param tx Raw explorer transaction object
 * @param decimals Decimals used to format the value (18 for native)
 */
function normalizeTx(tx: Record<string, unknown>, decimals = 18): HistoryEntry {
  const rawValue = String(tx.value ?? "0");
  let value = rawValue;
  try {
    value = formatUnits(BigInt(rawValue), decimals);
  } catch {
    // keep raw string if it is not a plain integer
  }
  const ts = tx.timeStamp ?? tx.timestamp;
  const timestamp =
    typeof ts === "string" && /^\d+$/.test(ts)
      ? new Date(Number(ts) * 1000).toISOString()
      : String(ts ?? "unknown");
  const isError = String(tx.isError ?? "0");
  const txStatus = String(tx.txreceipt_status ?? tx.status ?? "");

  return {
    hash: String(tx.hash ?? ""),
    from: String(tx.from ?? ""),
    to: String(tx.to ?? ""),
    value,
    token: typeof tx.tokenSymbol === "string" && tx.tokenSymbol ? tx.tokenSymbol : "PHRS",
    timestamp,
    status: isError === "1" || txStatus === "0" ? "failed" : "success",
  };
}

/**
 * Query the PharosScan explorer API (Etherscan-compatible) for recent
 * transactions of an address. Exported so verify_payment_received can
 * reuse it.
 * @param address Wallet address
 * @param limit Max results (1-50)
 * @param action Explorer action: "txlist" for native txs, "tokentx" for
 *   ERC20 transfers
 * @param contractAddress Optional token contract filter for "tokentx"
 * @returns Normalized transaction entries, newest first
 * @throws On invalid address, HTTP error, or non-JSON (bot protected) response
 */
export async function fetchExplorerTxs(
  address: string,
  limit: number,
  action: "txlist" | "tokentx" = "txlist",
  contractAddress?: string,
  network?: Network
): Promise<HistoryEntry[]> {
  if (!isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  const capped = Math.min(Math.max(limit, 1), 50);
  const config = getNetworkConfig(network);

  let url = `${config.explorerApi}?module=account&action=${action}&address=${address}&sort=desc&page=1&offset=${capped}`;
  if (contractAddress) {
    url += `&contractaddress=${contractAddress}`;
  }
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Explorer API request failed with status ${res.status}`);
  }

  const text = await res.text();
  let json: { status?: string; message?: string; result?: unknown };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `Explorer API returned a non-JSON response (it may be behind bot protection right now). Try again later or check the address directly at ${config.explorer}`
    );
  }

  if (!Array.isArray(json.result)) {
    throw new Error(
      `Explorer API returned no transaction list: ${json.message ?? "unknown response"}`
    );
  }

  return (json.result as Record<string, unknown>[]).slice(0, capped).map((tx) => {
    const tokenDecimal = Number(tx.tokenDecimal);
    return normalizeTx(tx, Number.isFinite(tokenDecimal) && tokenDecimal > 0 ? tokenDecimal : 18);
  });
}

/**
 * MCP handler for get_transaction_history: queries the PharosScan
 * explorer API (Etherscan-compatible txlist endpoint) for the most
 * recent transactions of an address.
 * @param input.address Wallet address
 * @param input.limit Max results (1-50, default 10)
 * @returns ToolResult with an array of normalized transactions
 */
export async function getTransactionHistory(input: {
  address: string;
  limit?: number;
  network?: Network;
}): Promise<ToolResult> {
  try {
    const transactions = await fetchExplorerTxs(
      input.address,
      input.limit ?? 10,
      "txlist",
      undefined,
      input.network
    );
    return ok({
      address: input.address,
      network: getNetworkConfig(input.network).networkName,
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    return fail(error);
  }
}
