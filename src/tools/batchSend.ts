import { z } from "zod";
import { transferToken } from "./sendToken.js";
import { ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for batch_send. */
export const batchSendSchema = {
  recipients: z
    .array(
      z.object({
        address: z.string().describe("Recipient wallet address"),
        amount: z.string().describe("Human readable amount to send"),
        token: z
          .enum(["USDC", "USDT", "WETH", "WPHRS"])
          .describe("Token to send to this recipient"),
      })
    )
    .min(1)
    .describe("List of recipients with address, amount, and token"),
  memo: z.string().optional().describe("Optional memo recorded in the response"),
};

interface BatchEntryResult {
  address: string;
  amount: string;
  token: string;
  success: boolean;
  txHash?: string;
  explorer?: string;
  error?: string;
}

/**
 * MCP handler for batch_send: sends tokens to multiple recipients in
 * sequence. ERC20 transfers cannot be routed through MultiCall3 because
 * the multicall contract would become msg.sender and would need an
 * allowance, so each transfer is sent as its own transaction. MultiCall3
 * is still used for batched balance reads elsewhere in this skill.
 * One failed transfer does not stop the rest of the batch.
 * @returns ToolResult with per-recipient results and a summary
 */
export async function batchSend(input: {
  recipients: { address: string; amount: string; token: "USDC" | "USDT" | "WETH" | "WPHRS" }[];
  memo?: string;
}): Promise<ToolResult> {
  try {
    const results: BatchEntryResult[] = [];

    for (const recipient of input.recipients) {
      try {
        const tx = await transferToken(recipient.token, recipient.address, recipient.amount);
        results.push({
          address: recipient.address,
          amount: recipient.amount,
          token: recipient.token,
          success: true,
          txHash: tx.hash,
          explorer: tx.explorer,
        });
      } catch (error) {
        results.push({
          address: recipient.address,
          amount: recipient.amount,
          token: recipient.token,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    const totals: Record<string, number> = {};
    for (const r of results) {
      if (r.success) {
        totals[r.token] = (totals[r.token] ?? 0) + Number(r.amount);
      }
    }

    return ok({
      memo: input.memo ?? null,
      results,
      summary: {
        total: results.length,
        successCount,
        failCount,
        totalSentByToken: totals,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
