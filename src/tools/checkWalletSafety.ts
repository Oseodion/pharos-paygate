import { z } from "zod";
import { isAddress } from "viem";
import { GOPLUS_API_URL, getNetworkConfig, type Network } from "../config/pharos.js";
import { ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for check_wallet_safety. */
export const checkWalletSafetySchema = {
  address: z.string().describe("Wallet address to screen for malicious activity"),
  chain_id: z
    .string()
    .optional()
    .describe('Chain ID for the lookup (defaults to the chosen network, "688689" for testnet)'),
  network: z
    .enum(["testnet", "mainnet"])
    .optional()
    .describe("Network to use: testnet (default) or mainnet"),
};

/** Risk levels returned by the safety tools. */
export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical" | "unknown";

/** Wallet safety assessment shared with safe_transfer and get_wallet_profile. */
export interface WalletSafetyReport {
  address: string;
  is_malicious: boolean;
  is_blacklisted: boolean;
  is_sanctioned: boolean;
  risk_level: RiskLevel;
  risk_details: string[];
  recommendation: "safe_to_transact" | "proceed_with_caution" | "do_not_transact";
  message?: string;
}

/** GoPlus flags that indicate the address is actively malicious. */
const MALICIOUS_FLAGS: Record<string, string> = {
  cybercrime: "linked to cybercrime",
  money_laundering: "linked to money laundering",
  financial_crime: "linked to financial crime",
  stealing_attack: "involved in stealing attacks",
  phishing_activities: "involved in phishing activities",
  malicious_mining_activities: "involved in malicious mining",
  darkweb_transactions: "involved in darkweb transactions",
  fake_kyc: "associated with fake KYC",
  honeypot_related_address: "related to honeypot scams",
};

/** GoPlus flags that warrant caution but are not outright malicious. */
const CAUTION_FLAGS: Record<string, string> = {
  blacklist_doubt: "suspected on a blacklist",
  mixer: "associated with a mixer service",
  gas_abuse: "associated with gas abuse",
  reinit: "contract can be redeployed with different code",
  fake_token: "associated with fake token creation",
  fake_standard_interface: "uses a fake standard interface",
  number_of_malicious_contracts_created: "has created malicious contracts",
};

/**
 * Map a GoPlus result value to a boolean flag. GoPlus uses "1"/"0"
 * strings and occasionally counts.
 * @param value Raw GoPlus field value
 * @returns True if the flag is set
 */
function flagSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "" && value !== "0" && value !== 0;
}

/**
 * Query the GoPlus malicious address API and derive a normalized safety
 * report. Exported so safe_transfer and get_wallet_profile can reuse it.
 * If GoPlus has no data for the address/chain, returns risk_level
 * "unknown" rather than throwing.
 * @param address Wallet address to screen
 * @param chainId Chain ID string (default "688689")
 * @returns Normalized WalletSafetyReport
 * @throws On invalid address or network failure reaching GoPlus
 */
export async function assessWalletSafety(
  address: string,
  chainId = "688689"
): Promise<WalletSafetyReport> {
  if (!isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }

  const url = `${GOPLUS_API_URL}/address_security/${address}?chain_id=${chainId}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`GoPlus API request failed with status ${res.status}`);
  }
  const json = (await res.json()) as {
    code?: number;
    message?: string;
    result?: Record<string, unknown> | null;
  };

  const result = json.result;
  if (!result || Object.keys(result).length === 0) {
    return {
      address,
      is_malicious: false,
      is_blacklisted: false,
      is_sanctioned: false,
      risk_level: "unknown",
      risk_details: [],
      recommendation: "proceed_with_caution",
      message: "No security data available for this address on this chain",
    };
  }

  const riskDetails: string[] = [];
  let maliciousHits = 0;
  let cautionHits = 0;

  for (const [flag, description] of Object.entries(MALICIOUS_FLAGS)) {
    if (flagSet(result[flag])) {
      maliciousHits++;
      riskDetails.push(description);
    }
  }
  for (const [flag, description] of Object.entries(CAUTION_FLAGS)) {
    if (flagSet(result[flag])) {
      cautionHits++;
      riskDetails.push(description);
    }
  }

  const isSanctioned = flagSet(result.sanctioned);
  const isBlacklisted = flagSet(result.blacklist_doubt);
  if (isSanctioned) {
    riskDetails.push("on a sanctions list");
  }

  let riskLevel: RiskLevel;
  if (isSanctioned || flagSet(result.stealing_attack)) {
    riskLevel = "critical";
  } else if (maliciousHits > 0) {
    riskLevel = "high";
  } else if (isBlacklisted || cautionHits >= 2) {
    riskLevel = "medium";
  } else if (cautionHits === 1) {
    riskLevel = "low";
  } else {
    riskLevel = "safe";
  }

  const recommendation =
    riskLevel === "high" || riskLevel === "critical"
      ? "do_not_transact"
      : riskLevel === "safe"
        ? "safe_to_transact"
        : "proceed_with_caution";

  return {
    address,
    is_malicious: maliciousHits > 0,
    is_blacklisted: isBlacklisted,
    is_sanctioned: isSanctioned,
    risk_level: riskLevel,
    risk_details: riskDetails,
    recommendation,
  };
}

/**
 * MCP handler for check_wallet_safety: screens a wallet address against
 * the GoPlus malicious address database.
 * @param input.address Wallet address
 * @param input.chain_id Chain ID (defaults from network, "688689" for testnet)
 * @param input.network Optional network ("testnet" | "mainnet")
 * @returns ToolResult with a WalletSafetyReport
 */
export async function checkWalletSafety(input: {
  address: string;
  chain_id?: string;
  network?: Network;
}): Promise<ToolResult> {
  try {
    const chainId = input.chain_id ?? String(getNetworkConfig(input.network).chainId);
    const report = await assessWalletSafety(input.address, chainId);
    return ok(report);
  } catch (error) {
    return fail(error);
  }
}
