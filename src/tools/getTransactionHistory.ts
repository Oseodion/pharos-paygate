import { z } from "zod";
import { formatUnits, isAddress } from "viem";
import { EXPLORER_API_URL } from "../config/pharos.js";
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
};

interface HistoryEntry {
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
 */
function normalizeTx(tx: Record<string, unknown>): HistoryEntry {
  const rawValue = String(tx.value ?? "0");
  let value = rawValue;
  try {
    value = formatUnits(BigInt(rawValue), 18);
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
    token: "PHRS",
    timestamp,
    status: isError === "1" || txStatus === "0" ? "failed" : "success",
  };
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
}): Promise<ToolResult> {
  try {
    if (!isAddress(input.address)) {
      return fail(`Invalid address: ${input.address}`);
    }
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);

    const url = `${EXPLORER_API_URL}?module=account&action=txlist&address=${input.address}&sort=desc&page=1&offset=${limit}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      return fail(`Explorer API request failed with status ${res.status}`);
    }

    const text = await res.text();
    let json: { status?: string; message?: string; result?: unknown };
    try {
      json = JSON.parse(text);
    } catch {
      return fail(
        "Explorer API returned a non-JSON response (it may be behind bot protection right now). Try again later or check the address directly at https://atlantic.pharosscan.xyz"
      );
    }

    if (!Array.isArray(json.result)) {
      return fail(
        `Explorer API returned no transaction list: ${json.message ?? "unknown response"}`
      );
    }

    const transactions = (json.result as Record<string, unknown>[])
      .slice(0, limit)
      .map(normalizeTx);

    return ok({
      address: input.address,
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    return fail(error);
  }
}
