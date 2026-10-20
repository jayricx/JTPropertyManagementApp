"use server";

import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { bankAccounts, leases, portfolios, properties, tenants, units, users } from "@/db/schema";
import { accessiblePropertyIds } from "@/lib/access";
import { resolveDueDay, utcDay, periodIndexForDate, periodStartAt } from "@/lib/billing-periods";
import { sendRentReminderEmail } from "@/lib/email";
import { appUrl } from "@/lib/app-url";
import { isUuid } from "@/lib/utils";

export type RentReminderState = { error?: string; ok?: boolean } | null;

/**
 * Manually send a rent reminder for one lease. Bypasses the cron's
 * "already reminded this period" check — the landlord pressed the button, so
 * they want it sent now regardless.
 */
export async function sendRentReminderAction(
  leaseId: string,
): Promise<RentReminderState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  if (!isUuid(leaseId)) return { error: "Lease not found." };

  const accessible = await accessiblePropertyIds(session.user.id);
  const [row] = await db
    .select({
      leaseId: leases.id,
      startDate: leases.startDate,
      rentDueDay: leases.rentDueDay,
      rentAmount: leases.rentAmount,
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
    .where(eq(leases.id, leaseId))
    .limit(1);

  if (!row) return { error: "Lease not found." };

  // Verify access via property.
  const [prop] = await db
    .select({ id: properties.id })
    .from(properties)
    .innerJoin(units, eq(units.propertyId, properties.id))
    .innerJoin(leases, eq(leases.unitId, units.id))
    .where(and(eq(leases.id, leaseId), inArray(properties.id, accessible)))
    .limit(1);
  if (!prop) return { error: "You don't have access to this lease." };

  if (!row.tenantEmail) {
    return { error: "This tenant has no email address on file." };
  }

  const leaseStart = utcDay(row.startDate);
  const dueDay = resolveDueDay(leaseStart, row.rentDueDay);
  const today = new Date();
  const todayUtc = new Date(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  const currentIdx = periodIndexForDate(todayUtc, leaseStart, dueDay);
  const currentStart = periodStartAt(currentIdx, leaseStart, dueDay);
  const nextStart =
    currentStart.getTime() === todayUtc.getTime()
      ? currentStart
      : periodStartAt(currentIdx + 1, leaseStart, dueDay);

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
    .where(eq(leases.id, leaseId));

  return { ok: true };
}