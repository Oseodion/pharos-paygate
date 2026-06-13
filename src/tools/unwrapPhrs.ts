import { z } from "zod";
import { parseUnits } from "viem";
import { WPHRS_ABI, explorerTxLink, getNetworkConfig, type Network } from "../config/pharos.js";
import { getPublicClient, getWalletClient, ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for unwrap_phrs. */
export const unwrapPhrsSchema = {
  amount: z.string().describe('Amount of wrapped native token (WPHRS/WPROS) to unwrap, e.g. "1.5"'),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/**
 * MCP handler for unwrap_phrs: unwraps the wrapped native token (WPHRS on
 * testnet, WPROS on mainnet) back to the native gas token by calling
 * withdraw(uint256) on the WETH-style wrapper contract.
 * @param input.amount Human readable wrapped amount
 * @param input.network Optional network ("testnet" | "mainnet")
 * @returns ToolResult with tx hash, explorer link, and amounts
 */
export async function unwrapPhrs(input: { amount: string; network?: Network }): Promise<ToolResult> {
  try {
    const parsed = Number(input.amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fail(`Invalid amount: ${input.amount}`);
    }
    const config = getNetworkConfig(input.network);
    const wrapped = config.tokens[config.wrappedNativeSymbol];
    if (!wrapped) {
      return fail(`No wrapped native token configured for ${config.networkName}`);
    }
    const wad = parseUnits(input.amount, 18);
    const wallet = getWalletClient(input.network);
    const publicClient = getPublicClient(input.network);

    const hash = await wallet.writeContract({
      address: wrapped.address,
      abi: WPHRS_ABI,
      functionName: "withdraw",
      args: [wad],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== "success") {
      return fail(`Unwrap transaction reverted: ${explorerTxLink(hash, input.network)}`);
    }

    return ok({
      network: config.networkName,
      tx_hash: hash,
      explorer_link: explorerTxLink(hash, input.network),
      amount_unwrapped: `${input.amount} ${wrapped.symbol}`,
      phrs_received: `${input.amount} ${config.nativeSymbol}`,
    });
  } catch (error) {
    return fail(error);
  }
}
