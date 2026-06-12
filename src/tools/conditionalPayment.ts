import { z } from "zod";
import { transferToken } from "./sendToken.js";
import { fetchTokenPrice } from "./getTokenPrice.js";
import { ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for conditional_payment. */
export const conditionalPaymentSchema = {
  to: z.string().describe("Recipient wallet address"),
  amount: z.string().describe('Amount to send in human readable units, e.g. "5.00"'),
  token: z.enum(["USDC", "USDT", "WETH", "WPHRS"]).describe("Token to send if the condition is met"),
  condition_token: z
    .enum(["PHRS", "USDC", "USDT", "WETH"])
    .describe("Token whose USD price drives the condition"),
  condition_operator: z
    .enum(["gt", "lt", "gte", "lte"])
    .describe("Comparison operator: gt, lt, gte, or lte"),
  condition_value: z
    .string()
    .describe('USD price threshold to compare against, e.g. "2000"'),
};

const OPERATOR_LABELS: Record<string, string> = {
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
};

/**
 * Evaluate a price comparison.
 * @param price Current price
 * @param operator One of gt, lt, gte, lte
 * @param threshold Threshold value
 * @returns Whether the condition holds
 */
function evaluateCondition(price: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case "gt":
      return price > threshold;
    case "lt":
      return price < threshold;
    case "gte":
      return price >= threshold;
    case "lte":
      return price <= threshold;
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

/**
 * MCP handler for conditional_payment: fetches the live price of the
 * condition token, evaluates the condition, and only executes the
 * payment when the condition is met. When skipped, the result explains
 * the current price versus the threshold.
 * @returns ToolResult with either the executed tx or a skip explanation
 */
export async function conditionalPayment(input: {
  to: string;
  amount: string;
  token: "USDC" | "USDT" | "WETH" | "WPHRS";
  condition_token: "PHRS" | "USDC" | "USDT" | "WETH";
  condition_operator: "gt" | "lt" | "gte" | "lte";
  condition_value: string;
}): Promise<ToolResult> {
  try {
    const threshold = Number(input.condition_value);
    if (!Number.isFinite(threshold)) {
      return fail(`Invalid condition_value: ${input.condition_value}`);
    }

    const quote = await fetchTokenPrice(input.condition_token);
    const met = evaluateCondition(quote.price, input.condition_operator, threshold);
    const conditionText = `${input.condition_token} price ${OPERATOR_LABELS[input.condition_operator]} $${threshold}`;

    if (!met) {
      return ok({
        executed: false,
        condition: conditionText,
        conditionMet: false,
        currentPrice: quote.price,
        priceSource: quote.source,
        message: `Payment skipped: condition "${conditionText}" not met. Current ${input.condition_token} price is $${quote.price}.`,
      });
    }

    const result = await transferToken(input.token, input.to, input.amount);
    return ok({
      executed: true,
      condition: conditionText,
      conditionMet: true,
      currentPrice: quote.price,
      priceSource: quote.source,
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
