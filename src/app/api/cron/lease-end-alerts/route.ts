import { NextResponse } from "next/server";
import { and, asc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { leases, properties, tenants, units, users } from "@/db/schema";
import { sendLeaseEndAlerts } from "@/lib/email";

// Data changes on every run — never cache this route.
export const dynamic = "force-dynamic";

/** Remind when a lease ends within this many days. */
const REMIND_WITHIN_DAYS = 30;

/**
 * Daily cron (see vercel.json) that emails landlords — and tenants when an
 * address is on file — when a lease is ending within REMIND_WITHIN_DAYS.
 * Vercel invokes cron routes with `Authorization: Bearer ${CRON_SECRET}`.
 * Each lease is reminded once; moving the end date resets the reminder.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Compare against today's UTC midnight; lease dates are stored as UTC
  // midnights so the calendar day matches exactly.
  const now = new Date();
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const horizon = new Date(
    today.getTime() + REMIND_WITHIN_DAYS * 24 * 60 * 60 * 1000,
  );

  const candidates = await db
    .select({
      leaseId: leases.id,
      endDate: leases.endDate,
      rentAmount: leases.rentAmount,
      tenantFirst: tenants.firstName,
      tenantLast: tenants.lastName,
      tenantEmail: tenants.email,
      unitName: units.name,
      propertyName: properties.name,
      landlordEmail: users.email,
      landlordName: users.name,
    })
    .from(leases)
    .innerJoin(tenants, eq(leases.tenantId, tenants.id))
    .innerJoin(units, eq(leases.unitId, units.id))
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .innerJoin(users, eq(properties.userId, users.id))
    .where(
      and(
        eq(leases.status, "active"),
        // Open-ended leases (null end date) never remind.
        isNotNull(leases.endDate),
        gte(leases.endDate, today),
        lte(leases.endDate, horizon),
        // One reminder per lease term.
        isNull(leases.leaseEndReminderSentAt),
      ),
    )
    .orderBy(asc(leases.endDate));

  let emailsSent = 0;
  let reminded = 0;

  for (const row of candidates) {
    if (!row.endDate) continue; // narrowing — guarded above
    const daysLeft = Math.round(
      (row.endDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
    );

    emailsSent += await sendLeaseEndAlerts({
      landlordEmail: row.landlordEmail,
      landlordName: row.landlordName,
      tenantName: `${row.tenantFirst} ${row.tenantLast}`,
      tenantEmail: row.tenantEmail,
      unitName: row.unitName,
      propertyName: row.propertyName,
      endDate: row.endDate,
      daysLeft,
      rentAmount: row.rentAmount,
    });

    await db
      .update(leases)
      .set({ leaseEndReminderSentAt: new Date() })
      .where(eq(leases.id, row.leaseId));
    reminded += 1;
  }

  console.log(
    `[cron:lease-end-alerts] candidates=${candidates.length} reminded=${reminded} emails=${emailsSent}`,
  );

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    reminded,
    emailsSent,
  });
}
