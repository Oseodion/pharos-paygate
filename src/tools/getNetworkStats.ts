import { z } from "zod";
import { formatGwei } from "viem";
import { getNetworkConfig, type Network } from "../config/pharos.js";
import { getPublicClient, ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for get_network_stats. */
export const getNetworkStatsSchema = {
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/**
 * MCP handler for get_network_stats: fetches live Pharos network stats
 * over RPC: current block number, gas price, and the latest block's
 * transaction count and timestamp.
 * @param input.network Optional network ("testnet" | "mainnet")
 * @returns ToolResult with the network snapshot
 */
export async function getNetworkStats(input: { network?: Network } = {}): Promise<ToolResult> {
  try {
    const config = getNetworkConfig(input.network);
    const client = getPublicClient(input.network);
    const [blockNumber, gasPrice, block] = await Promise.all([
      client.getBlockNumber(),
      client.getGasPrice(),
      client.getBlock(),
    ]);

    return ok({
      network: config.networkName,
      chain_id: config.chainId,
      block_number: blockNumber.toString(),
      gas_price_gwei: formatGwei(gasPrice),
      last_block_tx_count: block.transactions.length,
      last_block_timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      native_symbol: config.nativeSymbol,
      rpc_url: config.rpcUrl,
      explorer: config.explorer,
    });
  } catch (error) {
    return fail(error);
  }
}
