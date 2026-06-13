import { z } from "zod";
import { isAddress } from "viem";
import { explorerTxLink, getNetworkConfig, type Network } from "../config/pharos.js";
import { fetchExplorerTxs, type HistoryEntry } from "./getTransactionHistory.js";
import { ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for verify_payment_received. */
export const verifyPaymentReceivedSchema = {
  expected_from: z
    .string()
    .optional()
    .describe("Optional sender address the payment must come from"),
  expected_amount: z.string().describe('Expected amount in human readable units, e.g. "5.00"'),
  token: z
    .enum(["USDC", "USDT", "WETH", "WPHRS", "PHRS"])
    .describe("Token the payment should arrive in"),
  wallet_address: z.string().describe("The receiving wallet address to check"),
  since_minutes_ago: z
    .number()
    .int()
    .min(1)
    .default(30)
    .describe("How far back to look for the payment (default 30 minutes)"),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/** Relative tolerance used when matching amounts (covers rounding). */
const AMOUNT_TOLERANCE = 1e-9;

/**
 * Check whether one normalized transaction matches the expected payment.
 * @param tx Normalized explorer transaction
 * @param wallet Receiving wallet (lowercased)
 * @param from Optional expected sender (lowercased)
 * @param amount Expected amount as a number
 * @param since Earliest acceptable timestamp
 * @returns True if the transaction satisfies all criteria
 */
function matches(
  tx: HistoryEntry,
  wallet: string,
  from: string | undefined,
  amount: number,
  since: Date
): boolean {
  if (tx.status !== "success") return false;
  if (tx.to.toLowerCase() !== wallet) return false;
  if (from && tx.from.toLowerCase() !== from) return false;
  const value = Number(tx.value);
  if (!Number.isFinite(value) || Math.abs(value - amount) > AMOUNT_TOLERANCE * Math.max(1, amount)) {
    return false;
  }
  const ts = new Date(tx.timestamp);
  return !Number.isNaN(ts.getTime()) && ts >= since;
}

/**
 * MCP handler for verify_payment_received: scans recent explorer history
 * for an incoming payment matching the expected sender, amount, and
 * token. Native PHRS payments use the txlist endpoint; ERC20 payments
 * use the tokentx endpoint filtered by the token contract.
 * @returns ToolResult with {verified, matching_tx?, message}
 */
export async function verifyPaymentReceived(input: {
  expected_from?: string;
  expected_amount: string;
  token: "USDC" | "USDT" | "WETH" | "WPHRS" | "PHRS";
  wallet_address: string;
  since_minutes_ago?: number;
  network?: Network;
}): Promise<ToolResult> {
  try {
    if (!isAddress(input.wallet_address)) {
      return fail(`Invalid wallet address: ${input.wallet_address}`);
    }
    if (input.expected_from && !isAddress(input.expected_from)) {
      return fail(`Invalid expected_from address: ${input.expected_from}`);
    }
    const amount = Number(input.expected_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return fail(`Invalid expected_amount: ${input.expected_amount}`);
    }

    const config = getNetworkConfig(input.network);
    const sinceMinutes = input.since_minutes_ago ?? 30;
    const since = new Date(Date.now() - sinceMinutes * 60_000);

    // The native gas token (PHRS/PROS) uses txlist; ERC20s use tokentx.
    const isNative = input.token === "PHRS" || input.token === config.nativeSymbol;
    let transactions: HistoryEntry[];
    if (isNative) {
      transactions = await fetchExplorerTxs(
        input.wallet_address,
        50,
        "txlist",
        undefined,
        input.network
      );
    } else {
      const tokenInfo = config.tokens[input.token];
      if (!tokenInfo) {
        return fail(`Token ${input.token} is not available on ${config.networkName}`);
      }
      transactions = await fetchExplorerTxs(
        input.wallet_address,
        50,
        "tokentx",
        tokenInfo.address,
        input.network
      );
    }

    const wallet = input.wallet_address.toLowerCase();
    const from = input.expected_from?.toLowerCase();
    const match = transactions.find((tx) => matches(tx, wallet, from, amount, since));

    if (!match) {
      return ok({
        verified: false,
        message: `No matching incoming payment of ${input.expected_amount} ${input.token} to ${input.wallet_address}${input.expected_from ? ` from ${input.expected_from}` : ""} found in the last ${sinceMinutes} minutes (checked ${transactions.length} transactions).`,
      });
    }

    return ok({
      verified: true,
      matching_tx: {
        hash: match.hash,
        from: match.from,
        amount: match.value,
        timestamp: match.timestamp,
        explorer_link: explorerTxLink(match.hash, input.network),
      },
      message: `Payment of ${match.value} ${input.token} received from ${match.from} at ${match.timestamp}.`,
    });
  } catch (error) {
    return fail(error);
  }
}
