import { z } from "zod";
import { isAddress } from "viem";
import { getNetworkConfig, type Network } from "../config/pharos.js";
import { fetchBalances, type BalanceEntry } from "./getWalletBalances.js";
import { fetchTokenPrice } from "./getTokenPrice.js";
import { assessWalletSafety, type WalletSafetyReport } from "./checkWalletSafety.js";
import { getPublicClient, ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for get_wallet_profile. */
export const getWalletProfileSchema = {
  address: z.string().describe("Wallet address to build a profile for"),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/**
 * Classify a wallet by transaction count.
 * @param txCount Number of transactions sent from the wallet
 * @returns "new" (<10), "active" (10-100), or "veteran" (>100)
 */
function walletAge(txCount: number): "new" | "active" | "veteran" {
  if (txCount < 10) return "new";
  if (txCount <= 100) return "active";
  return "veteran";
}

/**
 * Resolve the USD price for a balance entry symbol. Wrapped native
 * tokens (WPHRS / WPROS) are priced the same as the native token since
 * they wrap it 1:1.
 * @param symbol Token symbol from the balances list
 * @returns USD price, or 0 if the price lookup fails
 */
async function priceFor(symbol: string): Promise<number> {
  try {
    const lookup = symbol === "WPHRS" || symbol === "WPROS" ? "PHRS" : symbol;
    const quote = await fetchTokenPrice(lookup);
    return quote.price;
  } catch {
    return 0;
  }
}

/**
 * MCP handler for get_wallet_profile: combines balances (multicall),
 * transaction count (eth_getTransactionCount), GoPlus safety screening,
 * and live prices into one wallet intelligence report with a USD
 * portfolio value.
 * @param input.address Wallet address
 * @param input.network Optional network ("testnet" | "mainnet")
 * @returns ToolResult with the full wallet profile
 */
export async function getWalletProfile(input: {
  address: string;
  network?: Network;
}): Promise<ToolResult> {
  try {
    if (!isAddress(input.address)) {
      return fail(`Invalid address: ${input.address}`);
    }
    const address = input.address as `0x${string}`;
    const config = getNetworkConfig(input.network);
    const client = getPublicClient(input.network);

    const [balances, txCount, safetyOutcome] = await Promise.all([
      fetchBalances(input.address, input.network),
      client.getTransactionCount({ address }),
      assessWalletSafety(input.address, String(config.chainId)).catch(
        (error): WalletSafetyReport => ({
          address: input.address,
          is_malicious: false,
          is_blacklisted: false,
          is_sanctioned: false,
          risk_level: "unknown",
          risk_details: [],
          recommendation: "proceed_with_caution",
          message: `Safety check unavailable: ${error instanceof Error ? error.message : String(error)}`,
        })
      ),
    ]);

    const priced = await Promise.all(
      balances.map(async (entry: BalanceEntry) => {
        const amount = Number(entry.balance);
        const price = Number.isFinite(amount) && amount > 0 ? await priceFor(entry.symbol) : 0;
        const usd = Number.isFinite(amount) ? amount * price : 0;
        return { ...entry, usd_value: Number(usd.toFixed(6)) };
      })
    );
    const totalUsd = priced.reduce((sum, entry) => sum + entry.usd_value, 0);

    return ok({
      address: input.address,
      network: config.networkName,
      total_portfolio_usd: Number(totalUsd.toFixed(2)),
      balances: priced,
      transaction_count: txCount,
      wallet_age_estimate: walletAge(txCount),
      safety_status: safetyOutcome.recommendation,
      risk_level: safetyOutcome.risk_level,
      safety_details: safetyOutcome.risk_details,
    });
  } catch (error) {
    return fail(error);
  }
}
