import { z } from "zod";
import { encodeFunctionData, formatGwei, formatUnits, isAddress, parseUnits } from "viem";
import { ERC20_ABI, TOKENS } from "../config/pharos.js";
import { fetchTokenPrice } from "./getTokenPrice.js";
import { getAccount, getPublicClient, ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for estimate_gas. */
export const estimateGasSchema = {
  to: z.string().describe("Recipient wallet address"),
  token: z
    .enum(["USDC", "USDT", "WETH", "WPHRS", "PHRS"])
    .describe("Token being transferred (PHRS for a native transfer)"),
  amount: z.string().describe('Human readable amount, e.g. "5.00"'),
};

/**
 * MCP handler for estimate_gas: estimates the gas needed for a token
 * transfer, the current gas price, and the total fee in both PHRS and
 * USD (using the $0.10 PHRS estimate).
 * @param input.to Recipient address
 * @param input.token Token symbol, PHRS meaning a native transfer
 * @param input.amount Human readable amount
 * @returns ToolResult with gas units, gas price, and fee totals
 */
export async function estimateGas(input: {
  to: string;
  token: "USDC" | "USDT" | "WETH" | "WPHRS" | "PHRS";
  amount: string;
}): Promise<ToolResult> {
  try {
    if (!isAddress(input.to)) {
      return fail(`Invalid recipient address: ${input.to}`);
    }
    const client = getPublicClient();
    const account = getAccount();
    const to = input.to as `0x${string}`;

    let gasUnits: bigint;
    if (input.token === "PHRS") {
      gasUnits = await client.estimateGas({
        account: account.address,
        to,
        value: parseUnits(input.amount, 18),
      });
    } else {
      const info = TOKENS[input.token];
      if (!info) {
        return fail(`Unsupported token: ${input.token}`);
      }
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to, parseUnits(input.amount, info.decimals)],
      });
      gasUnits = await client.estimateGas({
        account: account.address,
        to: info.address,
        data,
      });
    }

    const gasPrice = await client.getGasPrice();
    const totalWei = gasUnits * gasPrice;
    const totalPhrs = formatUnits(totalWei, 18);

    const phrsQuote = await fetchTokenPrice("PHRS");
    const totalUsd = Number(totalPhrs) * phrsQuote.price;

    return ok({
      token: input.token,
      to: input.to,
      amount: input.amount,
      estimatedGasUnits: gasUnits.toString(),
      gasPriceGwei: formatGwei(gasPrice),
      totalCostPhrs: totalPhrs,
      totalCostUsd: totalUsd.toFixed(8),
      phrsPriceNote: phrsQuote.note ?? null,
    });
  } catch (error) {
    return fail(error);
  }
}
