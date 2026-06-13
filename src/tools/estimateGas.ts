import { z } from "zod";
import { encodeFunctionData, formatGwei, formatUnits, isAddress, parseUnits } from "viem";
import { ERC20_ABI, getNetworkConfig, type Network } from "../config/pharos.js";
import { fetchTokenPrice } from "./getTokenPrice.js";
import { getAccount, getPublicClient, ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for estimate_gas. */
export const estimateGasSchema = {
  to: z.string().describe("Recipient wallet address"),
  token: z
    .enum(["USDC", "USDT", "WETH", "WPHRS", "PHRS"])
    .describe("Token being transferred (PHRS for a native transfer)"),
  amount: z.string().describe('Human readable amount, e.g. "5.00"'),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/**
 * MCP handler for estimate_gas: estimates the gas needed for a token
 * transfer, the current gas price, and the total fee in both the native
 * gas token and USD (using the $0.10 native estimate).
 * @param input.to Recipient address
 * @param input.token Token symbol, PHRS meaning a native transfer
 * @param input.amount Human readable amount
 * @param input.network Optional network ("testnet" | "mainnet")
 * @returns ToolResult with gas units, gas price, and fee totals
 */
export async function estimateGas(input: {
  to: string;
  token: "USDC" | "USDT" | "WETH" | "WPHRS" | "PHRS";
  amount: string;
  network?: Network;
}): Promise<ToolResult> {
  try {
    if (!isAddress(input.to)) {
      return fail(`Invalid recipient address: ${input.to}`);
    }
    const config = getNetworkConfig(input.network);
    const client = getPublicClient(input.network);
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
      const info = config.tokens[input.token];
      if (!info) {
        return fail(`Token ${input.token} is not available on ${config.networkName}`);
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
    const totalNative = formatUnits(totalWei, 18);

    const nativeQuote = await fetchTokenPrice(config.nativeSymbol);
    const totalUsd = Number(totalNative) * nativeQuote.price;

    return ok({
      network: config.networkName,
      token: input.token,
      to: input.to,
      amount: input.amount,
      estimatedGasUnits: gasUnits.toString(),
      gasPriceGwei: formatGwei(gasPrice),
      totalCostNative: `${totalNative} ${config.nativeSymbol}`,
      totalCostPhrs: totalNative,
      totalCostUsd: totalUsd.toFixed(8),
      nativePriceNote: nativeQuote.note ?? null,
    });
  } catch (error) {
    return fail(error);
  }
}
