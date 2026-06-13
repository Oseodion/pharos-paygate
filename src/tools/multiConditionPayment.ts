import { z } from "zod";
import { transferToken } from "./sendToken.js";
import { fetchTokenPrice } from "./getTokenPrice.js";
import { type Network } from "../config/pharos.js";
import { ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for multi_condition_payment. */
export const multiConditionPaymentSchema = {
  to: z.string().describe("Recipient wallet address"),
  amount: z.string().describe('Amount to send in human readable units, e.g. "5.00"'),
  token: z.enum(["USDC", "USDT", "WETH", "WPHRS"]).describe("Token to send if conditions pass"),
  conditions: z
    .array(
      z.object({
        condition_token: z
          .enum(["PHRS", "USDC", "USDT", "WETH"])
          .describe("Token whose USD price drives this condition"),
        operator: z.enum(["gt", "lt", "gte", "lte"]).describe("Comparison operator"),
        value: z.string().describe('USD price threshold, e.g. "2000"'),
      })
    )
    .min(1)
    .describe("List of price conditions to evaluate"),
  logic: z
    .enum(["AND", "OR"])
    .default("AND")
    .describe("AND requires every condition to pass, OR requires at least one"),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

const OPERATOR_LABELS: Record<string, string> = {
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
};

/**
 * Evaluate a single price comparison.
 * @param price Current price
 * @param operator One of gt, lt, gte, lte
 * @param threshold Threshold value
 * @returns Whether the condition holds
 */
function evaluate(price: number, operator: string, threshold: number): boolean {
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
 * MCP handler for multi_condition_payment: fetches live prices for every
 * condition token, evaluates each condition, combines them with AND/OR
 * logic, and only executes the transfer when the combined result is
 * true. Either way the result includes a per-condition breakdown of the
 * current price versus the threshold.
 * @returns ToolResult with the executed tx or a detailed skip breakdown
 */
export async function multiConditionPayment(input: {
  to: string;
  amount: string;
  token: "USDC" | "USDT" | "WETH" | "WPHRS";
  conditions: {
    condition_token: "PHRS" | "USDC" | "USDT" | "WETH";
    operator: "gt" | "lt" | "gte" | "lte";
    value: string;
  }[];
  logic?: "AND" | "OR";
  network?: Network;
}): Promise<ToolResult> {
  try {
    const logic = input.logic ?? "AND";

    const evaluations = await Promise.all(
      input.conditions.map(async (condition) => {
        const threshold = Number(condition.value);
        if (!Number.isFinite(threshold)) {
          throw new Error(`Invalid condition value: ${condition.value}`);
        }
        const quote = await fetchTokenPrice(condition.condition_token);
        const passed = evaluate(quote.price, condition.operator, threshold);
        return {
          condition: `${condition.condition_token} price ${OPERATOR_LABELS[condition.operator]} $${threshold}`,
          current_price: quote.price,
          price_source: quote.source,
          passed,
        };
      })
    );

    const passedCount = evaluations.filter((e) => e.passed).length;
    const conditionsMet =
      logic === "AND" ? passedCount === evaluations.length : passedCount > 0;

    if (!conditionsMet) {
      return ok({
        executed: false,
        logic,
        conditions_met: false,
        passed_count: passedCount,
        total_conditions: evaluations.length,
        evaluations,
        message: `Payment skipped: ${logic} logic requires ${logic === "AND" ? "all" : "at least one"} condition${logic === "AND" ? "s" : ""} to pass, but only ${passedCount} of ${evaluations.length} passed.`,
      });
    }

    const tx = await transferToken(input.token, input.to, input.amount, input.network);
    return ok({
      executed: true,
      logic,
      conditions_met: true,
      passed_count: passedCount,
      total_conditions: evaluations.length,
      evaluations,
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
