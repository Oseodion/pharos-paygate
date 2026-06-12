#!/usr/bin/env node
/**
 * pharos-paygate MCP server entry point.
 *
 * Exposes 9 payment tools for AI agents on the Pharos Atlantic Testnet
 * over the Model Context Protocol (stdio transport).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as dotenv from "dotenv";

import { getWalletBalances, getWalletBalancesSchema } from "./tools/getWalletBalances.js";
import { getTokenPrice, getTokenPriceSchema } from "./tools/getTokenPrice.js";
import { sendUsdc, sendUsdcSchema } from "./tools/sendUsdc.js";
import { sendToken, sendTokenSchema } from "./tools/sendToken.js";
import { conditionalPayment, conditionalPaymentSchema } from "./tools/conditionalPayment.js";
import { batchSend, batchSendSchema } from "./tools/batchSend.js";
import {
  getTransactionHistory,
  getTransactionHistorySchema,
} from "./tools/getTransactionHistory.js";
import { estimateGas, estimateGasSchema } from "./tools/estimateGas.js";
import { x402PayForResource, x402PayForResourceSchema } from "./tools/x402PayForResource.js";
import type { ToolResult } from "./utils/client.js";

dotenv.config();

const server = new McpServer({
  name: "pharos-paygate",
  version: "0.1.0",
});

/**
 * Convert a ToolResult into the MCP text content shape. Errors are
 * reported inside the JSON envelope so the server never crashes and the
 * agent always gets a structured answer.
 * @param result Tool result envelope
 * @returns MCP tool response content
 */
function toMcpResponse(result: ToolResult) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: !result.success,
  };
}

/**
 * Wrap a tool handler so any thrown error becomes a structured failure
 * envelope instead of crashing the MCP server.
 * @param handler Tool handler returning a ToolResult
 * @returns MCP-compatible handler
 */
function safeHandler<TInput>(handler: (input: TInput) => Promise<ToolResult>) {
  return async (input: TInput) => {
    try {
      return toMcpResponse(await handler(input));
    } catch (error) {
      return toMcpResponse({
        success: false,
        data: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

server.tool(
  "get_wallet_balances",
  "Get PHRS (native), USDC, USDT, WETH, and WPHRS balances for any wallet on Pharos Atlantic Testnet",
  getWalletBalancesSchema,
  safeHandler(getWalletBalances)
);

server.tool(
  "get_token_price",
  "Get the live USD price of PHRS, USDC, USDT, or WETH from CoinGecko",
  getTokenPriceSchema,
  safeHandler(getTokenPrice)
);

server.tool(
  "send_usdc",
  "Send USDC to an address on Pharos Atlantic Testnet, with an optional memo",
  sendUsdcSchema,
  safeHandler(sendUsdc)
);

server.tool(
  "send_token",
  "Send any supported token (USDC, USDT, WETH, WPHRS) to an address on Pharos Atlantic Testnet",
  sendTokenSchema,
  safeHandler(sendToken)
);

server.tool(
  "conditional_payment",
  "Send a payment only if a token price condition is met, e.g. send 5 USDC if WETH price > 2000",
  conditionalPaymentSchema,
  safeHandler(conditionalPayment)
);

server.tool(
  "batch_send",
  "Send tokens to multiple recipients in one call and get a per-recipient result summary",
  batchSendSchema,
  safeHandler(batchSend)
);

server.tool(
  "get_transaction_history",
  "Get recent transactions for an address from the Pharos Atlantic explorer",
  getTransactionHistorySchema,
  safeHandler(getTransactionHistory)
);

server.tool(
  "estimate_gas",
  "Estimate the gas cost of a token transfer in PHRS and USD",
  estimateGasSchema,
  safeHandler(estimateGas)
);

server.tool(
  "x402_pay_for_resource",
  "Fetch an x402-protected URL, automatically paying for it with USDC if the price is within max_price",
  x402PayForResourceSchema,
  safeHandler(x402PayForResource)
);

/**
 * Start the MCP server on stdio.
 */
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("pharos-paygate MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error starting pharos-paygate:", error);
  process.exit(1);
});
