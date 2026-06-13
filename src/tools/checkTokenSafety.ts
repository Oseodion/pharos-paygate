import { z } from "zod";
import { isAddress } from "viem";
import { GOPLUS_API_URL, getNetworkConfig, type Network } from "../config/pharos.js";
import { ok, fail, type ToolResult } from "../utils/client.js";
import type { RiskLevel } from "./checkWalletSafety.js";

/** Input schema for check_token_safety. */
export const checkTokenSafetySchema = {
  token_address: z.string().describe("Token contract address to analyze"),
  chain_id: z
    .string()
    .optional()
    .describe('Chain ID for the lookup (defaults to the chosen network, "688689" for testnet)'),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/**
 * Interpret a GoPlus "0"/"1" string as a boolean, treating missing
 * values as false.
 * @param value Raw GoPlus field value
 * @returns True if the value is "1"
 */
function isOne(value: unknown): boolean {
  return value === "1" || value === 1;
}

/**
 * MCP handler for check_token_safety: analyzes a token contract with the
 * GoPlus token security API (honeypot detection, taxes, mint/ownership
 * risks). Returns risk_level "unknown" when GoPlus has no data for the
 * token on this chain.
 * @param input.token_address Token contract address
 * @param input.chain_id Chain ID (default "688689")
 * @returns ToolResult with the token risk assessment
 */
export async function checkTokenSafety(input: {
  token_address: string;
  chain_id?: string;
  network?: Network;
}): Promise<ToolResult> {
  try {
    if (!isAddress(input.token_address)) {
      return fail(`Invalid token address: ${input.token_address}`);
    }
    const chainId = input.chain_id ?? String(getNetworkConfig(input.network).chainId);

    const url = `${GOPLUS_API_URL}/token_security/${chainId}?contract_addresses=${input.token_address}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      return fail(`GoPlus API request failed with status ${res.status}`);
    }
    const json = (await res.json()) as {
      code?: number;
      message?: string;
      result?: Record<string, Record<string, unknown>> | null;
    };

    const entry =
      json.result?.[input.token_address.toLowerCase()] ?? json.result?.[input.token_address];
    if (!entry || Object.keys(entry).length === 0) {
      return ok({
        token_address: input.token_address,
        risk_level: "unknown" as RiskLevel,
        message: "No security data available for this address on this chain",
      });
    }

    const isHoneypot = isOne(entry.is_honeypot);
    const isOpenSource = isOne(entry.is_open_source);
    const isProxy = isOne(entry.is_proxy);
    const canTakeBackOwnership = isOne(entry.can_take_back_ownership);
    const isMintable = isOne(entry.is_mintable);
    const buyTax = entry.buy_tax !== undefined ? String(entry.buy_tax) : "unknown";
    const sellTax = entry.sell_tax !== undefined ? String(entry.sell_tax) : "unknown";

    const risks: string[] = [];
    if (isHoneypot) risks.push("token is a honeypot: buyers cannot sell");
    if (!isOpenSource) risks.push("contract source code is not verified");
    if (isProxy) risks.push("contract is a proxy and its logic can change");
    if (canTakeBackOwnership) risks.push("ownership can be taken back by the deployer");
    if (isMintable) risks.push("supply is mintable and can be inflated");
    if (Number(buyTax) > 0.1) risks.push(`high buy tax: ${buyTax}`);
    if (Number(sellTax) > 0.1) risks.push(`high sell tax: ${sellTax}`);

    let riskLevel: RiskLevel;
    if (isHoneypot) {
      riskLevel = "critical";
    } else if (canTakeBackOwnership || Number(sellTax) > 0.5) {
      riskLevel = "high";
    } else if (risks.length >= 2) {
      riskLevel = "medium";
    } else if (risks.length === 1) {
      riskLevel = "low";
    } else {
      riskLevel = "safe";
    }

    return ok({
      token_address: input.token_address,
      is_honeypot: isHoneypot,
      is_open_source: isOpenSource,
      is_proxy: isProxy,
      buy_tax: buyTax,
      sell_tax: sellTax,
      can_take_back_ownership: canTakeBackOwnership,
      is_mintable: isMintable,
      risk_level: riskLevel,
      risk_summary: risks.length > 0 ? risks : ["no notable risks detected"],
    });
  } catch (error) {
    return fail(error);
  }
}
