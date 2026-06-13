import { z } from "zod";
import { transferToken } from "./sendToken.js";
import { getNetworkConfig, type Network } from "../config/pharos.js";
import { ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for send_usdc. */
export const sendUsdcSchema = {
  to: z.string().describe("Recipient wallet address"),
  amount: z
    .string()
    .describe('Amount of USDC in human readable units, e.g. "5.00"'),
  memo: z.string().optional().describe("Optional memo recorded in the response"),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/**
 * MCP handler for send_usdc: convenience wrapper around the shared
 * ERC20 transfer that always sends USDC.
 * @param input.to Recipient address
 * @param input.amount Human readable USDC amount
 * @param input.memo Optional memo echoed back in the result
 * @param input.network Optional network ("testnet" | "mainnet")
 * @returns ToolResult with tx hash and explorer link
 */
export async function sendUsdc(input: {
  to: string;
  amount: string;
  memo?: string;
  network?: Network;
}): Promise<ToolResult> {
  try {
    const result = await transferToken("USDC", input.to, input.amount, input.network);
    return ok({
      token: "USDC",
      to: input.to,
      amount: input.amount,
      memo: input.memo ?? null,
      network: getNetworkConfig(input.network).networkName,
      txHash: result.hash,
      explorer: result.explorer,
      status: result.status,
    });
  } catch (error) {
    return fail(error);
  }
}
