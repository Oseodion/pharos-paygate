import { z } from "zod";
import { isAddress, parseUnits } from "viem";
import { ERC20_ABI, explorerTxLink, getNetworkConfig, type Network } from "../config/pharos.js";
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
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/**
 * Core ERC20 transfer used by send_token, send_usdc, conditional_payment,
 * batch_send, safe_transfer, and multi_condition_payment. Resolves the
 * token from the requested network's registry, converts the human
 * readable amount using the token's decimals, sends the transfer, and
 * waits for the receipt.
 * @param token Supported token symbol
 * @param to Recipient address
 * @param amount Human readable amount string
 * @param network Optional network ("testnet" | "mainnet")
 * @returns Transaction hash, explorer link, and receipt status
 * @throws On invalid input, token not on the network, missing key, or RPC failure
 */
export async function transferToken(
  token: string,
  to: string,
  amount: string,
  network?: Network
): Promise<{ hash: string; explorer: string; status: string }> {
  const { tokens, networkName } = getNetworkConfig(network);
  const info = tokens[token];
  if (!info) {
    throw new Error(`Token ${token} is not available on ${networkName}`);
  }
  if (!isAddress(to)) {
    throw new Error(`Invalid recipient address: ${to}`);
  }
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }

  const value = parseUnits(amount, info.decimals);
  const wallet = getWalletClient(network);
  const publicClient = getPublicClient(network);

  const hash = await wallet.writeContract({
    address: info.address,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to as `0x${string}`, value],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    hash,
    explorer: explorerTxLink(hash, network),
    status: receipt.status,
  };
}

/**
 * MCP handler for send_token: generic transfer of any supported token.
 * @param input.token Token symbol (USDC, USDT, WETH, WPHRS)
 * @param input.to Recipient address
 * @param input.amount Human readable amount
 * @param input.network Optional network ("testnet" | "mainnet")
 * @returns ToolResult with tx hash and explorer link
 */
export async function sendToken(input: {
  token: "USDC" | "USDT" | "WETH" | "WPHRS";
  to: string;
  amount: string;
  network?: Network;
}): Promise<ToolResult> {
  try {
    const result = await transferToken(input.token, input.to, input.amount, input.network);
    return ok({
      token: input.token,
      to: input.to,
      amount: input.amount,
      network: getNetworkConfig(input.network).networkName,
      txHash: result.hash,
      explorer: result.explorer,
      status: result.status,
    });
  } catch (error) {
    return fail(error);
  }
}
