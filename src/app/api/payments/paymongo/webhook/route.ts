import { NextResponse } from "next/server";
import { applyCheckoutPaid } from "@/lib/payments/checkout";
import { verifyWebhookSignature } from "@/lib/payments/paymongo";

// Signature verification needs the exact raw body, so this must run on Node
// (node:crypto) and never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PayMongo webhook. This — not the browser — is the source of truth for a
 * successful card charge: the tenant can close the tab, and a cancelled
 * payment never creates a ledger entry. The request is authenticated by the
 * `Paymongo-Signature` header before we touch the database, and recording is
 * idempotent so replays are harmless.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("paymongo-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    // 401 (not 403) so a misconfigured secret is obvious in PayMongo's log.
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: PaymongoEvent;
  try {
    event = JSON.parse(rawBody) as PaymongoEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const type = event.data?.attributes?.type;
  const session = event.data?.attributes?.data;

  // PayMongo emits `checkout_session.payment.paid` once the session is paid.
  if (type === "checkout_session.payment.paid" && session?.id) {
    try {
      const result = await applyCheckoutPaid({
        providerRef: session.id,
        referenceNumber: session.attributes?.reference_number,
      });
      console.log(
        `[paymongo] checkout ${session.id} -> ${result} (ref ${session.attributes?.reference_number ?? "?"})`,
      );
    } catch (error) {
      // Return 500 so PayMongo retries; our recording is idempotent.
      console.error("[paymongo] webhook handling failed", error);
      return NextResponse.json({ error: "Handler failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

interface PaymongoEvent {
  data?: {
    attributes?: {
      type?: string;
      data?: {
        id?: string;
        attributes?: { reference_number?: string };
      };
    };
  };
}
