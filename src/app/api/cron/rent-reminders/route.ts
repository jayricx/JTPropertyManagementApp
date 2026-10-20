import { NextResponse } from "next/server";
import { and, asc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { bankAccounts, leases, portfolios, properties, tenants, units, users } from "@/db/schema";
import {
  periodIndexForDate,
  periodStartAt,
  resolveDueDay,
  utcDay,
} from "@/lib/billing-periods";
import { sendRentReminderEmail } from "@/lib/email";
import { appUrl } from "@/lib/app-url";
import { todayInManila } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Remind when rent is due within this many days. */
const REMIND_WITHIN_DAYS = 3;

/**
 * Daily cron that emails tenants when their rent is due within
 * REMIND_WITHIN_DAYS. Each period is reminded at most once — the
 * `rentReminderPeriodStart` column records which period was last nudged, and
 * a new period resets it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayInManila();
  const horizon = new Date(today.getTime() + REMIND_WITHIN_DAYS * 24 * 60 * 60 * 1000);

  // Active leases with a tenant email. We compute the due date per lease
  // rather than in SQL because the due day is clamped (31st in February) and
  // the first period starts on the move-in date, not the due day.
  const candidates = await db
    .select({
      leaseId: leases.id,
      startDate: leases.startDate,
      rentDueDay: leases.rentDueDay,
      rentAmount: leases.rentAmount,
      rentReminderPeriodStart: leases.rentReminderPeriodStart,
      tenantFirst: tenants.firstName,
      tenantLast: tenants.lastName,
      tenantEmail: tenants.email,
      unitName: units.name,
      propertyName: properties.name,
      gcashNumber: users.gcashNumber,
      gcashName: users.gcashName,
      landlordId: portfolios.ownerUserId,
    })
    .from(leases)
    .innerJoin(tenants, eq(leases.tenantId, tenants.id))
    .innerJoin(units, eq(leases.unitId, units.id))
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .innerJoin(portfolios, eq(properties.portfolioId, portfolios.id))
    .innerJoin(users, eq(portfolios.ownerUserId, users.id))
    .where(
      and(
        eq(leases.status, "active"),
        isNotNull(tenants.email),
      ),
    );

  let sent = 0;
  let skipped = 0;

  for (const row of candidates) {
    if (!row.tenantEmail) continue;

    const leaseStart = utcDay(row.startDate);
    const dueDay = resolveDueDay(leaseStart, row.rentDueDay);
    const currentIdx = periodIndexForDate(today, leaseStart, dueDay);
    const currentStart = periodStartAt(currentIdx, leaseStart, dueDay);
    // The upcoming due date: today itself if we're exactly on one, otherwise
    // the next period's start.
    const nextStart =
      currentStart.getTime() === today.getTime()
        ? currentStart
        : periodStartAt(currentIdx + 1, leaseStart, dueDay);

    if (nextStart.getTime() < today.getTime() || nextStart.getTime() > horizon.getTime()) {
      skipped += 1;
      continue;
    }

    // Already reminded for this period.
    const periodIso = nextStart.toISOString().slice(0, 10);
    if (row.rentReminderPeriodStart && row.rentReminderPeriodStart.toISOString().slice(0, 10) === periodIso) {
      skipped += 1;
      continue;
    }

    // Bank accounts for this landlord.
    const banks = await db
      .select({
        bankName: bankAccounts.bankName,
        accountNumber: bankAccounts.accountNumber,
        accountName: bankAccounts.accountName,
      })
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, row.landlordId));

    const dueDateText = nextStart.toLocaleDateString("en-PH", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

    await sendRentReminderEmail({
      to: row.tenantEmail,
      tenantName: `${row.tenantFirst} ${row.tenantLast}`.trim(),
      amountText: `₱${Number(row.rentAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
      dueDateText,
      unitName: row.unitName,
      propertyName: row.propertyName,
      gcashNumber: row.gcashNumber,
      gcashName: row.gcashName,
      bankAccounts: banks,
      portalUrl: `${appUrl()}/portal`,
    });

    await db
      .update(leases)
      .set({ rentReminderPeriodStart: nextStart })
      .where(eq(leases.id, row.leaseId));

    sent += 1;
  }

  console.log(`[cron:rent-reminders] candidates=${candidates.length} sent=${sent} skipped=${skipped}`);
  return NextResponse.json({ ok: true, sent, skipped });
}