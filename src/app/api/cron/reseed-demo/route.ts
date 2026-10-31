import { NextResponse } from "next/server";
import { demoCredentials } from "@/lib/demo";
import { reseedDemoAccount } from "@/lib/demo-seed";

/**
 * Nightly demo reseed: the public demo account ("Try the live demo") is
 * wiped and rebuilt so prospects always land on pristine sample data — no
 * held-over changes from yesterday's visitors, and the "lease ending soon"
 * story recomputes against today. Skips silently when the deployment hasn't
 * configured the demo account.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!demoCredentials()) {
    console.log("[cron:demo-reseed] skipped — DEMO_EMAIL/DEMO_PASSWORD not set");
    return NextResponse.json({ ok: false, skipped: "demo account not configured" });
  }

  try {
    const result = await reseedDemoAccount();
    console.log(`[cron:demo-reseed] reseeded: leases=${result.leases} payments=${result.payments} charges=${result.charges} readings=${result.readings} maintenance=${result.maintenance}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron:demo-reseed] failed:", error);
    return NextResponse.json({ ok: false, error: "reseed failed" }, { status: 500 });
  }
}
