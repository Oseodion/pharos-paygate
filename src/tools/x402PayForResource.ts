import { z } from "zod";
import { formatUnits, parseUnits } from "viem";
import {
  wrapFetchWithPayment,
  x402Client,
  decodePaymentResponseHeader,
  type PaymentRequirements,
} from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { CHAIN_ID } from "../config/pharos.js";
import { getAccount, getPublicClient, ok, fail, type ToolResult } from "../utils/client.js";

/** Input schema for x402_pay_for_resource. */
export const x402PayForResourceSchema = {
  url: z.string().url().describe("URL of the x402-protected resource"),
  max_price: z
    .string()
    .describe('Maximum USDC you are willing to pay, e.g. "0.01"'),
};

/** CAIP-2 network identifier for Pharos Atlantic. */
const PHAROS_NETWORK = `eip155:${CHAIN_ID}` as const;

/** USDC-style decimals used to interpret max_price. */
const PRICE_DECIMALS = 6;

/**
 * Extract the required atomic amount from a payment requirement,
 * supporting both x402 v2 ("amount") and v1 ("maxAmountRequired") shapes.
 * @param req Raw payment requirement object from a 402 response
 * @returns Atomic amount as bigint, or null if not parseable
 */
function requiredAmount(req: Record<string, unknown>): bigint | null {
  const raw = req.amount ?? req.maxAmountRequired;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

/**
 * Read a response body as JSON when possible, falling back to text.
 * @param res Fetch response
 * @returns Parsed JSON or raw text
 */
async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * MCP handler for x402_pay_for_resource: implements the x402 HTTP 402
 * payment protocol. Makes an initial request, and on a 402 response
 * parses the payment requirements. If the cheapest acceptable option is
 * within max_price, it signs a payment with the configured wallet and
 * retries the request with the payment header. If the price exceeds
 * max_price, it returns an error stating the actual price required.
 * @param input.url Resource URL
 * @param input.max_price Max USDC willing to pay (human readable)
 * @returns ToolResult with the resource data and payment details
 */
export async function x402PayForResource(input: {
  url: string;
  max_price: string;
}): Promise<ToolResult> {
  try {
    const maxAtomic = parseUnits(input.max_price, PRICE_DECIMALS);
    if (maxAtomic <= 0n) {
      return fail(`Invalid max_price: ${input.max_price}`);
    }

    // Step 1: initial request. If it is not a 402, no payment is needed.
    const initial = await fetch(input.url);
    if (initial.status !== 402) {
      const body = await readBody(initial);
      return ok({
        url: input.url,
        paid: false,
        httpStatus: initial.status,
        message: "Resource did not require payment",
        data: body,
      });
    }

    // Step 2: parse the payment requirements from the 402 response body.
    const paymentRequired = (await readBody(initial)) as {
      accepts?: Record<string, unknown>[];
      error?: string;
    };
    const accepts = Array.isArray(paymentRequired?.accepts)
      ? paymentRequired.accepts
      : [];
    if (accepts.length === 0) {
      return fail(
        "Got a 402 response but could not parse payment requirements from it"
      );
    }

    const amounts = accepts
      .map(requiredAmount)
      .filter((a): a is bigint => a !== null);
    if (amounts.length === 0) {
      return fail("Could not determine the required payment amount from the 402 response");
    }
    const cheapest = amounts.reduce((min, a) => (a < min ? a : min));

    // Step 3: enforce the agent's spending cap before signing anything.
    if (cheapest > maxAtomic) {
      return fail(
        `Payment required (${formatUnits(cheapest, PRICE_DECIMALS)} USDC) exceeds max_price (${input.max_price} USDC). Payment was not sent.`
      );
    }

    // Step 4: sign and send the payment, then retry the request.
    const signer = toClientEvmSigner(getAccount() as never, getPublicClient());
    const client = new x402Client()
      .register(PHAROS_NETWORK, new ExactEvmScheme(signer))
      .registerPolicy((_version: number, reqs: PaymentRequirements[]) =>
        reqs.filter((r) => {
          try {
            return BigInt(r.amount) <= maxAtomic;
          } catch {
            return false;
          }
        })
      );

    const fetchWithPayment = wrapFetchWithPayment(fetch, client);
    const paidResponse = await fetchWithPayment(input.url);
    const data = await readBody(paidResponse);

    if (!paidResponse.ok) {
      return fail(
        `Paid request failed with status ${paidResponse.status}: ${
          typeof data === "string" ? data : JSON.stringify(data)
        }`
      );
    }

    // Step 5: surface settlement details from the payment response header.
    let paymentReceipt: unknown = null;
    const receiptHeader = paidResponse.headers.get("x-payment-response");
    if (receiptHeader) {
      try {
        paymentReceipt = decodePaymentResponseHeader(receiptHeader);
      } catch {
        paymentReceipt = receiptHeader;
      }
    }

    return ok({
      url: input.url,
      paid: true,
      pricePaid: `${formatUnits(cheapest, PRICE_DECIMALS)} USDC`,
      maxPrice: `${input.max_price} USDC`,
      httpStatus: paidResponse.status,
      paymentReceipt,
      data,
    });
  } catch (error) {
    return fail(error);
  }
}
