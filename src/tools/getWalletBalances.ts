import { z } from "zod";
import { formatUnits, isAddress } from "viem";
import { ERC20_ABI, getNetworkConfig, type Network } from "../config/pharos.js";
import { getPublicClient, ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for get_wallet_balances. */
export const getWalletBalancesSchema = {
  address: z.string().describe("The wallet address to check balances for"),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/** One token balance entry, shared with get_wallet_profile. */
export interface BalanceEntry {
  symbol: string;
  balance: string;
  raw: string;
}

/**
 * Fetch the native balance plus all supported ERC20 balances for a
 * wallet on the requested network. ERC20 reads go through a single
 * multicall against MultiCall3. Exported so get_wallet_profile can reuse
 * it.
 * @param address Wallet address to inspect
 * @param network Optional network ("testnet" | "mainnet")
 * @returns Array of {symbol, balance, raw} entries
 * @throws On invalid address or RPC failure
 */
export async function fetchBalances(address: string, network?: Network): Promise<BalanceEntry[]> {
  if (!isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  const wallet = address as `0x${string}`;
  const config = getNetworkConfig(network);
  const client = getPublicClient(network);
  const tokens = Object.values(config.tokens);

  const [nativeBalance, erc20Results] = await Promise.all([
    client.getBalance({ address: wallet }),
    client.multicall({
      contracts: tokens.map((token) => ({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "balanceOf" as const,
        args: [wallet],
      })),
    }),
  ]);

  const balances: BalanceEntry[] = [
    {
      symbol: config.nativeSymbol,
      balance: formatUnits(nativeBalance, 18),
      raw: nativeBalance.toString(),
    },
  ];

  tokens.forEach((token, i) => {
    const result = erc20Results[i];
    if (result.status === "success") {
      const raw = result.result as bigint;
      balances.push({
        symbol: token.symbol,
        balance: formatUnits(raw, token.decimals),
        raw: raw.toString(),
      });
    } else {
      balances.push({ symbol: token.symbol, balance: "error", raw: "error" });
    }
  });

  return balances;
}

/**
 * MCP handler for get_wallet_balances.
 * @param input.address Wallet address to inspect
 * @param input.network Optional network ("testnet" | "mainnet")
 * @returns ToolResult with an array of {symbol, balance, raw} entries
 */
export async function getWalletBalances(input: {
  address: string;
  network?: Network;
}): Promise<ToolResult> {
  try {
    const balances = await fetchBalances(input.address, input.network);
    return ok({
      address: input.address,
      network: getNetworkConfig(input.network).networkName,
      balances,
    });
  } catch (error) {
    return fail(error);
  }
}
