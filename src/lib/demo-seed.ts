import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  charges,
  expenses,
  leaseNotes,
  leases,
  maintenanceRequests,
  meterReadings,
  meters,
  payments,
  portfolioMembers,
  portfolios,
  properties,
  tenants,
  units,
  users,
} from "@/db/schema";
import { demoCredentials } from "@/lib/demo";
import { todayInManila } from "@/lib/utils";

/**
 * Wipes and reseeds the public demo account, exactly like the local
 * `_seed_demo.mjs` script it mirrors — that script run by hand before this
 * became the nightly cron; this module keeps only one truth about the demo.
 *
 * Dates derive from "today" so the sample always lands the same way however
 * late it runs: Maria paid through the current period, Jose in arrears on it,
 * Ana's lease ending in three weeks, Roberto's GCash submission sitting in
 * the verification queue. Tenants never get an email address, so nothing a
 * visitor does while trying the demo can send real mail to a stranger.
 *
 * Visitor sessions survive a reseed (JWT, and `passwordChangedAt` is left
 * alone), which the dashboard's demo banner already warns about.
 */

// ---------------------------------------------------------------------------
// Date helpers — same convention as billing-periods: PH calendar days at UTC
// midnight, month arithmetic clamped to the month's real length.
// ---------------------------------------------------------------------------

/** `day`-th of the month of `base` (same year+month), clamped to month end. */
function monthDay(base: Date, day: number): Date {
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Math.min(day, last)));
}

/** `base` shifted `n` whole months, day-of-month clamped like the app does. */
function addMonths(base: Date, n: number): Date {
  const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(base.getUTCDate(), last));
  return first;
}

const day = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (d: Date) => iso(d).slice(0, 7);

// The current billing-period start for a due-day: that day of this month, or
// last month's when today hasn't reached it yet.
const currentPeriodStart = (today: Date, dueDay: number) =>
  today.getUTCDate() >= dueDay ? monthDay(today, dueDay) : monthDay(addMonths(today, -1), dueDay);

// ---------------------------------------------------------------------------

export interface ReseedResult {
  leases: number;
  payments: number;
  charges: number;
  readings: number;
  maintenance: number;
}

/** The demo account must be configured (DEMO_EMAIL/DEMO_PASSWORD) to reseed. */
export async function reseedDemoAccount(): Promise<ReseedResult> {
  const demo = demoCredentials();
  if (!demo) throw new Error("DEMO_EMAIL/DEMO_PASSWORD are not configured");

  const today = todayInManila();
  const passwordHash = await bcrypt.hash(demo.password, 10);

  let [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, demo.email))
    .limit(1);
  if (user) {
    await db
      .update(users)
      .set({ passwordHash, plan: "business", emailVerified: new Date() })
      .where(eq(users.id, user.id));
  } else {
    [user] = await db
      .insert(users)
      .values({
        name: "Renta-PH Demo",
        email: demo.email,
        emailVerified: new Date(),
        passwordHash,
        plan: "business",
        gcashNumber: "0917 555 0101",
        gcashName: "Demo Estates",
      })
      .returning({ id: users.id });
  }
  const uid = user.id;

  // --- wipe everything the demo account owns ---------------------------------
  const owned = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(eq(portfolios.ownerUserId, uid));
  for (const pf of owned) {
    const unitIds = (
      await db
        .select({ id: units.id })
        .from(units)
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .where(eq(properties.portfolioId, pf.id))
    ).map((u) => u.id);
    if (unitIds.length) {
      await db.delete(leases).where(inArray(leases.unitId, unitIds));
    }
    await db.delete(tenants).where(eq(tenants.portfolioId, pf.id));
    await db.delete(properties).where(eq(properties.portfolioId, pf.id));
    await db.delete(portfolioMembers).where(eq(portfolioMembers.portfolioId, pf.id));
    await db.delete(portfolios).where(eq(portfolios.id, pf.id));
  }
  for (const table of [payments, charges, expenses, maintenanceRequests] as const) {
    await db.delete(table).where(eq(table.userId, uid));
  }

  // --- portfolio ---------------------------------------------------------------
  const [pf] = await db
    .insert(portfolios)
    .values({
      name: "Demo Holdings",
      ownerUserId: uid,
      businessName: "Demo Estates Property Management",
    })
    .returning({ id: portfolios.id });
  await db
    .insert(portfolioMembers)
    .values({ portfolioId: pf.id, userId: uid, role: "owner" });

  // --- properties & units --------------------------------------------------------
  const [p1] = await db
    .insert(properties)
    .values({
      portfolioId: pf.id,
      name: "Sunset Residences",
      address: "12 Kamias Road",
      city: "Quezon City",
      state: "Metro Manila",
      zipCode: "1102",
      country: "Philippines",
      type: "condo",
    })
    .returning({ id: properties.id });
  const [p2] = await db
    .insert(properties)
    .values({
      portfolioId: pf.id,
      name: "Mabini Apartments",
      address: "8 Mabini Street",
      city: "Pasig",
      state: "Metro Manila",
      zipCode: "1606",
      country: "Philippines",
      type: "apartment",
    })
    .returning({ id: properties.id });

  const unit = (
    propertyId: string,
    name: string,
    bedrooms: number,
    rent: string,
    sqm: number,
    status: "occupied" | "vacant",
  ) =>
    db
      .insert(units)
      .values({ propertyId, name, bedrooms, bathrooms: "1.0", rentAmount: rent, sqm, status })
      .returning({ id: units.id })
      .then((r) => r[0].id);

  const u12A = await unit(p1.id, "Unit 12A", 1, "12000", 24, "occupied");
  const u12B = await unit(p1.id, "Unit 12B", 1, "9500", 22, "occupied");
  const u15F = await unit(p1.id, "Unit 15F", 2, "18500", 40, "occupied");
  const u12C = await unit(p1.id, "Unit 12C", 1, "11000", 24, "vacant");
  const u1A = await unit(p2.id, "Unit 1A", 1, "7500", 20, "occupied");
  const u1B = await unit(p2.id, "Unit 1B", 1, "8000", 22, "occupied");

  // --- tenants (no email addresses — demo actions can never send real mail) ----
  const tenant = (firstName: string, lastName: string, phone: string, notes: string | null) =>
    db
      .insert(tenants)
      .values({ userId: uid, portfolioId: pf.id, firstName, lastName, phone, notes })
      .returning({ id: tenants.id })
      .then((r) => r[0].id);

  const tMaria = await tenant("Maria", "Santos", "0917 220 8814", "Move-in was spotless. Prefers GCash at the start of the month.");
  const tJose = await tenant("Jose", "Garcia", "0921 334 5590", null);
  const tAna = await tenant("Ana", "Dela Cruz", "0918 447 2213", "Works in Ortigas; asked about renewing before her lease ends.");
  const tRoberto = await tenant("Roberto", "Reyes", "0926 118 4477", null);
  const tLiza = await tenant("Liza", "Mendoza", "0915 908 3325", "Long-term tenant, three renewals and counting.");

  // --- leases --------------------------------------------------------------------
  const dMaria = currentPeriodStart(today, 5);
  const dJose = currentPeriodStart(today, 10);
  const dAna = monthDay(today, 1);
  const dRoberto = currentPeriodStart(today, 15);
  const dLiza = dAna;

  const lease = (
    unitId: string,
    tenantId: string,
    startDate: Date,
    endDate: Date | null,
    rentDueDay: number,
    rentAmount: string,
    notes: string | null,
  ) =>
    db
      .insert(leases)
      .values({
        unitId,
        tenantId,
        startDate,
        endDate,
        rentDueDay,
        rentAmount,
        depositAmount: rentAmount,
        status: "active",
        notes,
      })
      .returning({ id: leases.id })
      .then((r) => r[0].id);

  const lMaria = await lease(u12A, tMaria, addMonths(dMaria, -4), addMonths(dMaria, 14), 5, "12000", null);
  const lJose = await lease(u12B, tJose, addMonths(dJose, -3), addMonths(dJose, 9), 10, "9500", "Moved in with two housemates; pays for himself.");
  const lAna = await lease(u15F, tAna, addMonths(dAna, -7), new Date(today.getTime() + 21 * day), 1, "18500", "Renewal decision due before the lease ends.");
  const lRoberto = await lease(u1B, tRoberto, addMonths(dRoberto, -1), addMonths(dRoberto, 11), 15, "8000", null);
  const lLiza = await lease(u1A, tLiza, addMonths(dLiza, -24), null, 1, "7500", null);

  // --- payments --------------------------------------------------------------------
  // paidDate sits a couple of days after each period starts, so the statements
  // engine buckets every payment into exactly the period it was made for.
  const pay = (
    leaseId: string,
    amount: string,
    paidDate: Date,
    method: "gcash" | "cash" | "bank_transfer",
    status: "paid" | "pending",
    notes: string,
  ) =>
    db.insert(payments).values({
      userId: uid,
      leaseId,
      amount,
      paidDate,
      method,
      type: "rent",
      status,
      notes,
      reviewedAt: status === "paid" ? paidDate : null,
    });

  let paymentCount = 0;
  const ref = (i: number) => `GCash ref 40${21 + i}${String(1000 + i * 7).slice(-4)}`;

  // Maria — fully paid, five periods of history (the fifth = current period).
  for (let k = 0; k <= 4; k++) {
    const paidDate = new Date(addMonths(dMaria, k - 4).getTime() + 2 * day);
    await pay(lMaria, "12000", paidDate, "gcash", "paid", ref(k));
    paymentCount += 1;
  }
  // Jose — three periods paid, the current one genuinely in arrears.
  for (let k = 0; k <= 2; k++) {
    const paidDate = new Date(addMonths(dJose, k - 3).getTime() + 3 * day);
    await pay(lJose, "9500", paidDate, "cash", "paid", "Received in person");
    paymentCount += 1;
  }
  // Ana — paid through the current period; her lease ends in three weeks.
  for (let k = 0; k <= 7; k++) {
    const paidDate = new Date(addMonths(dAna, k - 7).getTime() + 2 * day);
    await pay(lAna, "18500", paidDate, "bank_transfer", "paid", "BPI transfer confirmed");
    paymentCount += 1;
  }
  // Roberto — last period paid, this one waiting on verification.
  {
    const p0 = addMonths(dRoberto, -1);
    const paidDate = new Date(p0.getTime() + 2 * day);
    await pay(lRoberto, "8000", paidDate, "gcash", "paid", "GCash ref 40291037");
    await pay(lRoberto, "8000", new Date(today.getTime() - 3 * day), "gcash", "pending", "GCash ref 0928 665 3321 — awaiting check");
    paymentCount += 2;
  }
  // Liza — long history; the last eight periods (k = 24 is the current one).
  for (let k = 17; k <= 24; k++) {
    const paidDate = new Date(addMonths(dLiza, k - 24).getTime() + 2 * day);
    await pay(lLiza, "7500", paidDate, "cash", "paid", "Received in person");
    paymentCount += 1;
  }

  // --- charges (association dues, a penalty) ------------------------------------------
  // Filed with exact period boundaries so every charge lands in the right statement.
  let chargeCount = 0;
  const dues = async (leaseId: string, base: Date, amount: string) => {
    for (const off of [-1, 0]) {
      const start = addMonths(base, off);
      if (start > today) continue;
      await db.insert(charges).values({
        leaseId,
        userId: uid,
        periodStart: start,
        periodEnd: addMonths(base, off + 1),
        type: "dues",
        description: "Association dues",
        amount,
      });
      chargeCount += 1;
    }
  };

  await dues(lMaria, dMaria, "350");
  await dues(lJose, dJose, "350");
  await dues(lAna, dAna, "480");
  await db.insert(charges).values({
    leaseId: lLiza,
    userId: uid,
    periodStart: dLiza,
    periodEnd: addMonths(dLiza, 1),
    type: "penalty",
    description: "Late payment fee",
    amount: "200",
  });
  chargeCount += 1;

  // --- meters & readings ----------------------------------------------------------------
  // Electric sub-meters per unit, water on the two condo units. Chains stay
  // consistent: this month's previousReading = last month's currentReading.
  const prevDay26 = monthDay(addMonths(today, -1), 26);
  const recentDate = (n: number) => new Date(today.getTime() - n * day);

  const meterRead = (meterId: string, prev: number, cur: number, rate: string, readingDate: Date) =>
    db.insert(meterReadings).values({
      meterId,
      periodMonth: monthKey(readingDate),
      readingDate,
      previousReading: String(prev),
      currentReading: String(cur),
      consumption: String(cur - prev),
      rate,
      amount: ((cur - prev) * Number(rate)).toFixed(2),
    });

  let readingCount = 0;

  const m12AE = await db
    .insert(meters)
    .values({ unitId: u12A, type: "electric", label: "Meralco sub-meter", rate: "12.5000" })
    .returning({ id: meters.id })
    .then((r) => r[0].id);
  const m12AW = await db
    .insert(meters)
    .values({ unitId: u12A, type: "water", label: "Water sub-meter", rate: "45.0000" })
    .returning({ id: meters.id })
    .then((r) => r[0].id);
  const m12BE = await db
    .insert(meters)
    .values({ unitId: u12B, type: "electric", label: "Meralco sub-meter", rate: "12.5000" })
    .returning({ id: meters.id })
    .then((r) => r[0].id);
  const m15FE = await db
    .insert(meters)
    .values({ unitId: u15F, type: "electric", label: "Meralco sub-meter", rate: "11.8000" })
    .returning({ id: meters.id })
    .then((r) => r[0].id);
  const m15FW = await db
    .insert(meters)
    .values({ unitId: u15F, type: "water", label: "Water sub-meter", rate: "48.0000" })
    .returning({ id: meters.id })
    .then((r) => r[0].id);
  const m1AW = await db
    .insert(meters)
    .values({ unitId: u1A, type: "water", label: "Water sub-meter", rate: "45.0000" })
    .returning({ id: meters.id })
    .then((r) => r[0].id);
  const m1BE = await db
    .insert(meters)
    .values({ unitId: u1B, type: "electric", label: "Meralco sub-meter", rate: "12.5000" })
    .returning({ id: meters.id })
    .then((r) => r[0].id);

  await meterRead(m12AE, 1180, 1420, "12.5000", prevDay26); readingCount += 1;
  await meterRead(m12AE, 1420, 1585, "12.5000", recentDate(2)); readingCount += 1;
  await meterRead(m12AW, 208, 219, "45.0000", prevDay26); readingCount += 1;
  await meterRead(m12AW, 219, 228, "45.0000", recentDate(2)); readingCount += 1;
  await meterRead(m12BE, 890, 1085, "12.5000", prevDay26); readingCount += 1;
  await meterRead(m12BE, 1085, 1220, "12.5000", recentDate(1)); readingCount += 1;
  await meterRead(m15FE, 3320, 3520, "11.8000", prevDay26); readingCount += 1;
  await meterRead(m15FE, 3520, 3663, "11.8000", recentDate(1)); readingCount += 1;
  await meterRead(m15FW, 402, 418, "48.0000", prevDay26); readingCount += 1;
  await meterRead(m15FW, 418, 429, "48.0000", recentDate(1)); readingCount += 1;
  await meterRead(m1BE, 460, 575, "12.5000", recentDate(1)); readingCount += 1;
  await meterRead(m1AW, 310, 322, "45.0000", recentDate(1)); readingCount += 1;

  // --- expenses ---------------------------------------------------------------------------
  await db.insert(expenses).values([
    {
      userId: uid,
      propertyId: p1.id,
      unitId: u12C,
      category: "supplies",
      amount: "950",
      expenseDate: recentDate(9),
      vendor: "Wilcon Depot",
      notes: "Paint and rollers for Unit 12C turnover",
    },
    {
      userId: uid,
      propertyId: p2.id,
      unitId: u1A,
      category: "repair",
      amount: "1800",
      expenseDate: recentDate(17),
      vendor: "Mr. Fixit Plumbing",
      notes: "Kitchen sink leak — replaced trap",
    },
    {
      userId: uid,
      propertyId: p1.id,
      unitId: null,
      category: "utilities",
      amount: "2340",
      expenseDate: recentDate(12),
      vendor: "Meralco",
      notes: "Common-area electric share",
    },
  ]);

  // --- maintenance --------------------------------------------------------------------------
  const stamp = (daysAgo: number) => new Date(today.getTime() - daysAgo * day);
  await db.insert(maintenanceRequests).values([
    {
      userId: uid,
      propertyId: p2.id,
      unitId: u1A,
      tenantId: tLiza,
      title: "Kitchen faucet drip",
      description: "Steady drip from the sink faucet since Thursday.",
      status: "resolved",
      priority: "low",
      cost: "350",
      createdAt: stamp(20),
      updatedAt: stamp(16),
      resolvedAt: stamp(16),
    },
    {
      userId: uid,
      propertyId: p1.id,
      unitId: u12B,
      tenantId: tJose,
      title: "Aircon not cooling",
      description: "Says it blows cool for a minute then only air. Asked for cleaning or a tech visit.",
      status: "new",
      priority: "urgent",
      cost: null,
      createdAt: stamp(2),
      updatedAt: stamp(2),
      resolvedAt: null,
    },
    {
      userId: uid,
      propertyId: p2.id,
      unitId: u1B,
      tenantId: tRoberto,
      title: "Scuffed walls",
      description: "Listening to him: he wants the walls repainted before he signs another year.",
      status: "in_progress",
      priority: "medium",
      cost: "1200",
      createdAt: stamp(8),
      updatedAt: stamp(8),
      resolvedAt: null,
    },
  ]);

  await db.insert(leaseNotes).values({
    leaseId: lMaria,
    userId: uid,
    body: "Pays rent on the 3rd via GCash, every month like clockwork.",
  });

  return { leases: 5, payments: paymentCount, charges: chargeCount, readings: readingCount, maintenance: 3 };
}
