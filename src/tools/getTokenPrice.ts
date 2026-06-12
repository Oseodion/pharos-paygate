import { z } from "zod";
import { COINGECKO_IDS, PHRS_PRICE_ESTIMATE_USD } from "../config/pharos.js";
import { ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for get_token_price. */
export const getTokenPriceSchema = {
  token: z.enum(["PHRS", "USDC", "USDT", "WETH"]).describe("Token symbol to price"),
  currency: z.enum(["USD"]).default("USD").describe("Quote currency (only USD supported)"),
};

/** Price lookup result shared with other tools. */
export interface PriceQuote {
  token: string;
  price: number;
  currency: string;
  source: string;
  note?: string;
  timestamp: string;
}

/**
 * Fetch the live USD price of a token. PHRS is not listed on CoinGecko,
 * so it falls back to a fixed $0.10 estimate with an explanatory note.
 * Exported so conditional_payment and estimate_gas can reuse it.
 * @param token Token symbol (PHRS, USDC, USDT, WETH)
 * @returns A PriceQuote with price, source, and timestamp
 * @throws If the CoinGecko request fails or returns no price
 */
export async function fetchTokenPrice(token: string): Promise<PriceQuote> {
  const timestamp = new Date().toISOString();

  if (token === "PHRS" || token === "WPHRS") {
    return {
      token,
      price: PHRS_PRICE_ESTIMATE_USD,
      currency: "USD",
      source: "estimate",
      note: "PHRS price not available on CoinGecko, using $0.10 as estimate",
      timestamp,
    };
  }

  const id = COINGECKO_IDS[token];
  if (!id) {
    throw new Error(`Unsupported token for pricing: ${token}`);
  }

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CoinGecko request failed with status ${res.status}`);
  }
  const json = (await res.json()) as Record<string, { usd?: number }>;
  const price = json[id]?.usd;
  if (price === undefined) {
    throw new Error(`CoinGecko returned no USD price for ${token}`);
  }

  return { token, price, currency: "USD", source: "coingecko", timestamp };
}

/**
 * MCP handler for get_token_price.
 * @param input.token Token symbol
 * @param input.currency Quote currency (USD)
 * @returns ToolResult wrapping a PriceQuote
 */
export async function getTokenPrice(input: {
  token: "PHRS" | "USDC" | "USDT" | "WETH";
  currency?: "USD";
}): Promise<ToolResult> {
  try {
    const quote = await fetchTokenPrice(input.token);
    return ok(quote);
  } catch (error) {
    return fail(error);
  }
}
