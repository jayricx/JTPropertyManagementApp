import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal PayMongo client for card rent payments. Tenants pay on PayMongo's
 * hosted Checkout Session page, so raw card data never reaches this app —
 * which keeps it out of PCI scope. The webhook (not the browser) confirms the
 * charge; see `@/lib/payments/checkout` for the idempotent recording.
 */
const PAYMONGO_API = "https://api.paymongo.com/v1";

export class PaymongoError extends Error {
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "PaymongoError";
    this.status = status;
    this.details = details;
  }
}

function secretKey(): string | undefined {
  return (process.env.PAYMONGO_SECRET_KEY ?? "").trim() || undefined;
}

function webhookSecret(): string | undefined {
  return (process.env.PAYMONGO_WEBHOOK_SECRET ?? "").trim() || undefined;
}

/** True when a PayMongo secret key is configured (card checkout is possible). */
export function paymongoEnabled(): boolean {
  return Boolean(secretKey());
}

/** True when the webhook signing secret is configured (we can verify events). */
export function paymongoWebhookConfigured(): boolean {
  return Boolean(webhookSecret());
}

function authHeader(key: string): string {
  // PayMongo uses HTTP Basic with the secret key as the username and no
  // password, so the encoded value is `base64("<key>:")`.
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export interface CheckoutSessionInput {
  /** Amount in centavos (₱1 = 100). */
  amountCentavos: number;
  /** Shown on PayMongo's page under the line item. */
  description: string;
  /** The line-item label, e.g. "Rent — Maple Court Unit 3". */
  lineItemName: string;
  /** Our reference, echoed back on the webhook for reconciliation. */
  referenceNumber: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  checkoutUrl: string;
}

/**
 * Create a hosted Checkout Session and return its id + redirect URL. Only
 * `card` is offered: e-wallets stay on the manual GCash flow so the landlord
 * keeps receiving straight to their own wallet. Throws `PaymongoError` on any
 * non-2xx response or an unexpected shape.
 */
export async function createCheckoutSession(
  input: CheckoutSessionInput,
): Promise<CheckoutSession> {
  const key = secretKey();
  if (!key) throw new PaymongoError("PayMongo is not configured.");

  const response = await fetch(`${PAYMONGO_API}/checkout_sessions`, {
    method: "POST",
    headers: {
      Authorization: authHeader(key),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          payment_method_types: ["card"],
          line_items: [
            {
              currency: "PHP",
              amount: input.amountCentavos,
              name: input.lineItemName,
              quantity: 1,
            },
          ],
          description: input.description,
          reference_number: input.referenceNumber,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
        },
      },
    }),
  });

  const body = (await response.json().catch(() => null)) as {
    data?: { id?: string; attributes?: { checkout_url?: string } };
    errors?: unknown;
  } | null;

  if (!response.ok) {
    throw new PaymongoError(
      `PayMongo rejected the checkout session (HTTP ${response.status}).`,
      response.status,
      body,
    );
  }

  const id = body?.data?.id;
  const checkoutUrl = body?.data?.attributes?.checkout_url;
  if (!id || !checkoutUrl) {
    throw new PaymongoError(
      "PayMongo returned an unexpected response.",
      response.status,
      body,
    );
  }
  return { id, checkoutUrl };
}

/**
 * Verify the `Paymongo-Signature` header against the raw request body.
 *
 * The header looks like `t=<ts>,te=<testSig>,li=<liveSig>`; the signature is
 * HMAC-SHA256(webhook secret, "<ts>.<rawBody>"). PayMongo sends a test and a
 * live signature, so we accept whichever matches the secret we hold. The
 * comparison is constant-time.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = webhookSecret();
  if (!secret || !signatureHeader) return false;

  const parts = new Map<string, string>();
  for (const segment of signatureHeader.split(",")) {
    const index = segment.indexOf("=");
    if (index > 0) {
      parts.set(segment.slice(0, index).trim(), segment.slice(index + 1).trim());
    }
  }

  const timestamp = parts.get("t");
  if (!timestamp) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return [parts.get("te"), parts.get("li")].some(
    (candidate) => candidate != null && timingSafeEqualHex(candidate, expected),
  );
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
