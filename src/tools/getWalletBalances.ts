import { z } from "zod";
import { formatUnits, isAddress } from "viem";
import { ERC20_ABI, TOKENS } from "../config/pharos.js";
import { getPublicClient, ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for get_wallet_balances. */
export const getWalletBalancesSchema = {
  address: z.string().describe("The wallet address to check balances for"),
};

interface BalanceEntry {
  symbol: string;
  balance: string;
  raw: string;
}

/**
 * Fetch PHRS (native) plus all supported ERC20 balances for a wallet.
 * ERC20 reads go through a single multicall against MultiCall3.
 * @param input.address Wallet address to inspect
 * @returns ToolResult with an array of {symbol, balance, raw} entries
 */
export async function getWalletBalances(input: {
  address: string;
}): Promise<ToolResult> {
  try {
    if (!isAddress(input.address)) {
      return fail(`Invalid address: ${input.address}`);
    }
    const address = input.address as `0x${string}`;
    const client = getPublicClient();
    const tokens = Object.values(TOKENS);

    const [nativeBalance, erc20Results] = await Promise.all([
      client.getBalance({ address }),
      client.multicall({
        contracts: tokens.map((token) => ({
          address: token.address,
          abi: ERC20_ABI,
          functionName: "balanceOf" as const,
          args: [address],
        })),
      }),
    ]);

    const balances: BalanceEntry[] = [
      {
        symbol: "PHRS",
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

    return ok({ address, network: "Pharos Atlantic Testnet", balances });
  } catch (error) {
    return fail(error);
  }
}
