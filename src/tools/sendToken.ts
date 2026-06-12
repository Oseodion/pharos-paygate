import { z } from "zod";
import { isAddress, parseUnits } from "viem";
import { ERC20_ABI, TOKENS, explorerTxLink } from "../config/pharos.js";
import {
  getPublicClient,
  getWalletClient,
  ok,
  fail,
  type ToolResult,
} from "../utils/client.js";

/** Input schema for send_token. */
export const sendTokenSchema = {
  token: z.enum(["USDC", "USDT", "WETH", "WPHRS"]).describe("Token to send"),
  to: z.string().describe("Recipient wallet address"),
  amount: z
    .string()
    .describe('Amount in human readable units, e.g. "5.00" for 5 USDC'),
};

/**
 * Core ERC20 transfer used by send_token, send_usdc, conditional_payment,
 * and batch_send. Converts the human readable amount using the token's
 * decimals, sends the transfer, and waits for the receipt.
 * @param token Supported token symbol
 * @param to Recipient address
 * @param amount Human readable amount string
 * @returns Transaction hash, explorer link, and receipt status
 * @throws On invalid input, missing key, or RPC failure
 */
export async function transferToken(
  token: string,
  to: string,
  amount: string
): Promise<{ hash: string; explorer: string; status: string }> {
  const info = TOKENS[token];
  if (!info) {
    throw new Error(`Unsupported token: ${token}`);
  }
  if (!isAddress(to)) {
    throw new Error(`Invalid recipient address: ${to}`);
  }
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }

  const value = parseUnits(amount, info.decimals);
  const wallet = getWalletClient();
  const publicClient = getPublicClient();

  const hash = await wallet.writeContract({
    address: info.address,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to as `0x${string}`, value],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    hash,
    explorer: explorerTxLink(hash),
    status: receipt.status,
  };
}

/**
 * MCP handler for send_token: generic transfer of any supported token.
 * @param input.token Token symbol (USDC, USDT, WETH, WPHRS)
 * @param input.to Recipient address
 * @param input.amount Human readable amount
 * @returns ToolResult with tx hash and explorer link
 */
export async function sendToken(input: {
  token: "USDC" | "USDT" | "WETH" | "WPHRS";
  to: string;
  amount: string;
}): Promise<ToolResult> {
  try {
    const result = await transferToken(input.token, input.to, input.amount);
    return ok({
      token: input.token,
      to: input.to,
      amount: input.amount,
      txHash: result.hash,
      explorer: result.explorer,
      status: result.status,
    });
  } catch (error) {
    return fail(error);
  }
}
