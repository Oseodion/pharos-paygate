import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getNetworkConfig, type Network } from "../config/pharos.js";
import { getAccount, ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for create_payment_request. */
export const createPaymentRequestSchema = {
  amount: z.string().describe('Amount requested in human readable units, e.g. "5.00"'),
  token: z
    .enum(["USDC", "USDT", "WETH", "WPHRS", "PHRS"])
    .describe("Token the payment should be made in"),
  memo: z.string().optional().describe("Optional memo describing what the payment is for"),
  expires_in_minutes: z
    .number()
    .int()
    .min(1)
    .default(60)
    .describe("Minutes until the request expires (default 60)"),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/**
 * MCP handler for create_payment_request: generates a structured payment
 * request payable to the configured wallet (derived from PRIVATE_KEY).
 * The request is self-contained: an agent can hand the payment_uri to a
 * counterparty and later confirm it with verify_payment_received.
 * @param input.amount Human readable amount
 * @param input.token Token symbol
 * @param input.memo Optional memo
 * @param input.expires_in_minutes Expiry window in minutes
 * @returns ToolResult with the payment request object
 */
export async function createPaymentRequest(input: {
  amount: string;
  token: "USDC" | "USDT" | "WETH" | "WPHRS" | "PHRS";
  memo?: string;
  expires_in_minutes?: number;
  network?: Network;
}): Promise<ToolResult> {
  try {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return fail(`Invalid amount: ${input.amount}`);
    }

    const config = getNetworkConfig(input.network);
    const account = getAccount();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + (input.expires_in_minutes ?? 60) * 60_000
    );

    const expiryHuman = expiresAt.toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
      timeZoneName: "short",
    });

    return ok({
      payment_request_id: randomUUID(),
      payable_to: account.address,
      amount: input.amount,
      token: input.token,
      network: config.networkName,
      memo: input.memo ?? null,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      status: "pending",
      payment_uri: `Send ${input.amount} ${input.token} to ${account.address} on ${config.networkName} by ${expiryHuman}${input.memo ? ` (memo: ${input.memo})` : ""}`,
    });
  } catch (error) {
    return fail(error);
  }
}
