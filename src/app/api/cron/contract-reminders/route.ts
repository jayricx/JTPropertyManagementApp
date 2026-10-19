import { NextResponse } from "next/server";
import {
  CONTRACT_LINK_DAYS,
  deliverContractReminder,
  markReminderSent,
  remindersDue,
} from "@/lib/contracts";

// Data changes on every run — never cache this route.
export const dynamic = "force-dynamic";

/**
 * Daily cron (see vercel.json) that nudges a tenant about a contract they were
 * sent but never opened, at 3 and 7 days.
 *
 * The second chase is deliberately last. Past a week the most likely
 * explanation isn't indifference — it's that the first email went to spam, or
 * the tenant moved and the address bounced — and at that point another email
 * helps less than the landlord picking up the phone.
 *
 * Sending reissues the signing link, which is safe *only* because the query
 * filters on status `sent`: nothing here has been opened, so any earlier link
 * was never usable and nothing a tenant already holds is being invalidated.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidates = await remindersDue();

  let sent = 0;
  let failed = 0;

  for (const row of candidates) {
    const outcome = await deliverContractReminder(row);
    if (outcome.ok) {
      sent += 1;
      await markReminderSent(row.id, row.attempt);
    } else {
      // Not stamped, so the next run tries again — a provider outage shouldn't
      // silently cost a tenant their only reminder.
      failed += 1;
      console.error(
        `[cron:contract-reminders] ${row.id} v${row.version} attempt ${row.attempt}:`,
        outcome.problem,
      );
    }
  }

  console.log(
    `[cron:contract-reminders] due=${candidates.length} sent=${sent} failed=${failed}`,
  );

  return NextResponse.json({
    ok: true,
    due: candidates.length,
    sent,
    failed,
    linkDays: CONTRACT_LINK_DAYS,
  });
}