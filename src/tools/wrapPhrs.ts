import { z } from "zod";
import { parseUnits } from "viem";
import { WPHRS_ABI, explorerTxLink, getNetworkConfig, type Network } from "../config/pharos.js";
import { getPublicClient, getWalletClient, ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for wrap_phrs. */
export const wrapPhrsSchema = {
  amount: z.string().describe('Amount of native gas token (PHRS/PROS) to wrap, e.g. "1.5"'),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/**
 * MCP handler for wrap_phrs: wraps the native gas token into its wrapped
 * form (WPHRS on testnet, WPROS on mainnet) by calling deposit() on the
 * WETH-style wrapper contract with the amount as value.
 * @param input.amount Human readable native amount
 * @param input.network Optional network ("testnet" | "mainnet")
 * @returns ToolResult with tx hash, explorer link, and amounts
 */
export async function wrapPhrs(input: { amount: string; network?: Network }): Promise<ToolResult> {
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
    const value = parseUnits(input.amount, 18);
    const wallet = getWalletClient(input.network);
    const publicClient = getPublicClient(input.network);

    const hash = await wallet.writeContract({
      address: wrapped.address,
      abi: WPHRS_ABI,
      functionName: "deposit",
      value,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== "success") {
      return fail(`Wrap transaction reverted: ${explorerTxLink(hash, input.network)}`);
    }

    return ok({
      network: config.networkName,
      tx_hash: hash,
      explorer_link: explorerTxLink(hash, input.network),
      amount_wrapped: `${input.amount} ${config.nativeSymbol}`,
      wphrs_received: `${input.amount} ${wrapped.symbol}`,
    });
  } catch (error) {
    return fail(error);
  }
}
