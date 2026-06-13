import { z } from "zod";
import { isAddress } from "viem";
import { GOPLUS_API_URL, getNetworkConfig, type Network } from "../config/pharos.js";
import { ok, fail, type ToolResult } from "../utils/client.js";
import type { RiskLevel } from "./checkWalletSafety.js";

/** Input schema for check_contract_safety. */
export const checkContractSafetySchema = {
  contract_address: z.string().describe("Smart contract address to analyze"),
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
 * Interpret a GoPlus "0"/"1" string as a boolean.
 * @param value Raw GoPlus field value
 * @returns True if the value is "1"
 */
function isOne(value: unknown): boolean {
  return value === "1" || value === 1;
}

/**
 * MCP handler for check_contract_safety: analyzes a smart contract with
 * the GoPlus contract security API (verification status, proxy pattern,
 * known risk items). Returns overall_risk "unknown" when GoPlus has no
 * data for the contract on this chain.
 * @param input.contract_address Contract address
 * @param input.chain_id Chain ID (default "688689")
 * @returns ToolResult with the contract risk assessment
 */
export async function checkContractSafety(input: {
  contract_address: string;
  chain_id?: string;
  network?: Network;
}): Promise<ToolResult> {
  try {
    if (!isAddress(input.contract_address)) {
      return fail(`Invalid contract address: ${input.contract_address}`);
    }
    const chainId = input.chain_id ?? String(getNetworkConfig(input.network).chainId);

    const url = `${GOPLUS_API_URL}/contract_security/${chainId}?contract_addresses=${input.contract_address}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      return fail(`GoPlus API request failed with status ${res.status}`);
    }
    const json = (await res.json()) as {
      code?: number;
      message?: string;
      result?: Record<string, Record<string, unknown>> | Record<string, unknown> | null;
    };

    // The result may be keyed by lowercase contract address or be a flat object.
    const resultMap = json.result as Record<string, unknown> | null | undefined;
    const keyed = resultMap?.[input.contract_address.toLowerCase()] ?? resultMap?.[input.contract_address];
    const entry = (keyed ?? resultMap) as Record<string, unknown> | null | undefined;

    if (!entry || Object.keys(entry).length === 0) {
      return ok({
        contract_address: input.contract_address,
        overall_risk: "unknown" as RiskLevel,
        message: "No security data available for this address on this chain",
      });
    }

    const isOpenSource = isOne(entry.is_open_source);
    const isProxy = isOne(entry.is_proxy);

    const riskItems: string[] = [];
    if (!isOpenSource) riskItems.push("contract source code is not verified");
    if (isProxy) riskItems.push("contract is a proxy and its logic can be upgraded");
    if (isOne(entry.selfdestruct)) riskItems.push("contract can self destruct");
    if (isOne(entry.external_call)) riskItems.push("contract makes external calls");
    if (isOne(entry.is_blacklisted)) riskItems.push("contract supports blacklisting addresses");
    if (isOne(entry.can_take_back_ownership)) riskItems.push("ownership can be taken back");

    let overallRisk: RiskLevel;
    if (isOne(entry.selfdestruct) || isOne(entry.can_take_back_ownership)) {
      overallRisk = "high";
    } else if (riskItems.length >= 2) {
      overallRisk = "medium";
    } else if (riskItems.length === 1) {
      overallRisk = "low";
    } else {
      overallRisk = "safe";
    }

    const recommendation =
      overallRisk === "high"
        ? "Avoid interacting with this contract unless you fully trust the deployer"
        : overallRisk === "safe"
          ? "No notable risks detected, safe to interact"
          : "Review the risk items before interacting with this contract";

    return ok({
      contract_address: input.contract_address,
      is_verified: isOpenSource,
      is_open_source: isOpenSource,
      is_proxy: isProxy,
      risk_items: riskItems.length > 0 ? riskItems : ["no notable risks detected"],
      overall_risk: overallRisk,
      recommendation,
    });
  } catch (error) {
    return fail(error);
  }
}
