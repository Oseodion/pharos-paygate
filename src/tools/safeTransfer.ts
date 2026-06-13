import { z } from "zod";
import { transferToken } from "./sendToken.js";
import { assessWalletSafety, type WalletSafetyReport } from "./checkWalletSafety.js";
import { getNetworkConfig, type Network } from "../config/pharos.js";
import { ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for safe_transfer. */
export const safeTransferSchema = {
  to: z.string().describe("Recipient wallet address"),
  amount: z.string().describe('Amount in human readable units, e.g. "5.00"'),
  token: z.enum(["USDC", "USDT", "WETH", "WPHRS"]).describe("Token to send"),
  skip_safety_check: z
    .boolean()
    .default(false)
    .describe("Set true to send even if the recipient is flagged as risky"),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/**
 * MCP handler for safe_transfer: screens the recipient with GoPlus
 * before sending. If the recipient's risk level is high or critical and
 * skip_safety_check is false, the transfer is aborted and the safety
 * report is returned instead. Otherwise the transfer executes through
 * the shared transferToken() path and the result combines the safety
 * outcome with the transaction details. If the safety service itself is
 * unreachable, the transfer is aborted rather than sent blind.
 * @returns ToolResult with safety report plus tx result, or an abort report
 */
export async function safeTransfer(input: {
  to: string;
  amount: string;
  token: "USDC" | "USDT" | "WETH" | "WPHRS";
  skip_safety_check?: boolean;
  network?: Network;
}): Promise<ToolResult> {
  try {
    const skipCheck = input.skip_safety_check ?? false;
    const chainId = String(getNetworkConfig(input.network).chainId);

    let safety: WalletSafetyReport | null = null;
    let safetyError: string | null = null;
    try {
      safety = await assessWalletSafety(input.to, chainId);
    } catch (error) {
      safetyError = error instanceof Error ? error.message : String(error);
    }

    if (!skipCheck) {
      if (safetyError) {
        return fail(
          `Transfer aborted: could not verify recipient safety (${safetyError}). Retry, or pass skip_safety_check: true to send anyway.`
        );
      }
      if (safety && (safety.risk_level === "high" || safety.risk_level === "critical")) {
        return ok({
          executed: false,
          aborted_reason: `Recipient flagged as ${safety.risk_level} risk`,
          safety_check: safety,
          message:
            "Transfer aborted by safety screening. Pass skip_safety_check: true only if you are certain this recipient is legitimate.",
        });
      }
    }

    const tx = await transferToken(input.token, input.to, input.amount, input.network);
    return ok({
      executed: true,
      network: getNetworkConfig(input.network).networkName,
      safety_check: safety ?? {
        risk_level: "unknown",
        message: safetyError
          ? `Safety check skipped after error: ${safetyError}`
          : "Safety check skipped by request",
      },
      token: input.token,
      to: input.to,
      amount: input.amount,
      txHash: tx.hash,
      explorer: tx.explorer,
      status: tx.status,
    });
  } catch (error) {
    return fail(error);
  }
}
