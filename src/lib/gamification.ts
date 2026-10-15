import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  achievements,
  leases,
  maintenanceRequests,
  payments,
  properties,
  units,
  xpEvents,
} from "@/db/schema";
import { accessiblePropertyIds } from "@/lib/access";
import { formatCurrency } from "@/lib/utils";

// ---------------------------------------------------------------------------
// XP — an append-only ledger of landlord-positive actions. Server actions
// call awardXp() on success; it must never break the main action, so errors
// are swallowed.
// ---------------------------------------------------------------------------

export const XP_REWARDS = {
  property_created: 50,
  unit_created: 15,
  tenant_created: 20,
  lease_created: 30,
  payment_recorded: 10,
  expense_recorded: 5,
  maintenance_created: 10,
  maintenance_resolved: 25,
  portal_granted: 15,
} as const;

export type XpType = keyof typeof XP_REWARDS;

export async function awardXp(userId: string, type: XpType): Promise<void> {
  try {
    await db
      .insert(xpEvents)
      .values({ userId, type, amount: XP_REWARDS[type] });
  } catch {
    // Gamification is best-effort — a failed XP write must not fail the action.
  }
}

// Level curve: triangular thresholds scaled to 50 (L2=100, L3=300, L4=600,
// L5=1000, L6=1500, …) — quick early levels, steady grind after.
export function levelFloor(level: number): number {
  return 50 * level * (level - 1);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < 999 && levelFloor(level + 1) <= xp) level += 1;
  return level;
}

// Titles change every level through 10 so each level-up feels like
// something, then widen into bands.
const LEVEL_TITLES: { min: number; title: string }[] = [
  { min: 1, title: "Rookie Landlord" },
  { min: 2, title: "Apprentice Landlord" },
  { min: 3, title: "Handy Landlord" },
  { min: 4, title: "Hustling Landlord" },
  { min: 5, title: "Rental Rockstar" },
  { min: 6, title: "Deal Maker" },
  { min: 7, title: "Property Pro" },
  { min: 8, title: "Landlord Legend" },
  { min: 9, title: "Portfolio Pro" },
  { min: 10, title: "Real Estate Mogul" },
  { min: 11, title: "Real Estate Veteran" },
  { min: 15, title: "Property Tycoon" },
];

export function levelTitle(level: number): string {
  let title = LEVEL_TITLES[0].title;
  for (const band of LEVEL_TITLES) {
    if (level >= band.min) title = band.title;
  }
  return title;
}

// ---------------------------------------------------------------------------
// Badges — evaluated from portfolio data on every dashboard load; the first
// time a condition is met the unlock is persisted (one row per user+key) so
// the celebration only fires once.
// ---------------------------------------------------------------------------

export interface BadgeDef {
  key: string;
  title: string;
  description: string;
  /** Icon name resolved to a lucide component on the client. */
  icon:
    | "home"
    | "building"
    | "key"
    | "calendar-check"
    | "zap"
    | "trending-up"
    | "crown";
}

export const BADGES: BadgeDef[] = [
  {
    key: "first_property",
    title: "First Steps",
    description: "Register your first property",
    icon: "home",
  },
  {
    key: "portfolio_builder",
    title: "Portfolio Builder",
    description: "Own 5 properties",
    icon: "building",
  },
  {
    key: "full_house",
    title: "Full House",
    description: "Fill every unit (3+ units)",
    icon: "key",
  },
  {
    key: "perfect_month",
    title: "Perfect Month",
    description: "Collect 100% of rent for a full month",
    icon: "calendar-check",
  },
  {
    key: "speed_runner",
    title: "Speed Runner",
    description: "Resolve a request within 24 hours",
    icon: "zap",
  },
  {
    key: "six_figures",
    title: "Six Figures",
    description: `Record ${formatCurrency(100_000)} in rental income`,
    icon: "trending-up",
  },
  {
    key: "tycoon",
    title: "Property Tycoon",
    description: `Record ${formatCurrency(500_000)} in rental income`,
    icon: "crown",
  },
];

// ---------------------------------------------------------------------------
// Dashboard overview — one orchestrator that fetches everything once and
// derives the health score, level, streak, and badge states. Portfolio scope
// matches the dashboard KPIs: owned + co-owned properties.
// ---------------------------------------------------------------------------

export interface HealthComponent {
  key: "occupancy" | "collection" | "maintenance" | "lease_stability";
  label: string;
  /** 0–100 — only meaningful when `applicable`. */
  score: number;
  applicable: boolean;
  detail: string;
}

export interface BadgeState extends BadgeDef {
  /** ISO timestamp of the unlock, or null while still locked. */
  unlockedAt: string | null;
}

export interface GamificationOverview {
  level: number;
  levelTitle: string;
  xp: number;
  xpThisWeek: number;
  /** XP floor of the current / next level, for the progress bar. */
  currentLevelXp: number;
  nextLevelXp: number | null;
  /** null when there isn't enough data yet (no units, leases, or requests). */
  healthScore: number | null;
  healthComponents: HealthComponent[];
  /** Consecutive completed months with 100% rent collection. */
  streakMonths: number;
  badges: BadgeState[];
  /** Keys unlocked during this evaluation — the client celebrates these. */
  justUnlocked: string[];
}

const HEALTH_WEIGHTS: Record<HealthComponent["key"], number> = {
  occupancy: 0.35,
  collection: 0.35,
  maintenance: 0.2,
  lease_stability: 0.1,
};

const DAY_MS = 86_400_000;
const LEASE_RISK_DAYS = 60;
/** Cap for streak lookback — enough to outlive any realistic streak display. */
const STREAK_LOOKBACK_MONTHS = 24;

/** Sum of lease rents per month, using lease date overlap (UTC date math —
 * DB date columns are stored at UTC midnight). */
function rentDueForMonth(
  leaseRows: LeaseRow[],
  monthStartUtc: number,
  monthEndUtc: number, // exclusive
): { due: number; leaseIds: Set<string> } {
  let due = 0;
  const leaseIds = new Set<string>();
  for (const lease of leaseRows) {
    const start = lease.startDate.getTime();
    const end = lease.endDate ? lease.endDate.getTime() : Infinity;
    if (start < monthEndUtc && end >= monthStartUtc) {
      due += Number(lease.rentAmount);
      leaseIds.add(lease.id);
    }
  }
  return { due, leaseIds };
}

interface LeaseRow {
  id: string;
  startDate: Date;
  endDate: Date | null;
  rentAmount: string;
  status: "upcoming" | "active" | "ended";
}

interface PaymentRow {
  leaseId: string | null;
  amount: string;
  paidDate: Date;
}

export async function getGamificationOverview(
  userId: string,
): Promise<GamificationOverview> {
  const now = new Date();
  // Compare DB `date` values (UTC midnight) against UTC-built month bounds so
  // timezone offsets never shift a payment into the wrong month.
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthStartUtc = Date.UTC(y, m, 1);
  const monthEndUtc = Date.UTC(y, m + 1, 1); // exclusive
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const leaseRiskThreshold = todayUtc + LEASE_RISK_DAYS * DAY_MS;
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const accessible = await accessiblePropertyIds(userId);

  const [xpAgg, achRows, unitRows, leaseRows, maintRows] = await Promise.all([
    db
      .select({
        total: sql<string>`coalesce(sum(${xpEvents.amount}), 0)::int`,
        thisWeek: sql<string>`coalesce(sum(${xpEvents.amount}) filter (where ${xpEvents.createdAt} >= ${weekAgo}), 0)::int`,
      })
      .from(xpEvents)
      .where(eq(xpEvents.userId, userId)),
    db
      .select({ key: achievements.key, unlockedAt: achievements.unlockedAt })
      .from(achievements)
      .where(eq(achievements.userId, userId)),
    accessible.length
      ? db
          .select({ id: units.id, status: units.status })
          .from(units)
          .innerJoin(properties, eq(units.propertyId, properties.id))
          .where(inArray(units.propertyId, accessible))
      : Promise.resolve([]),
    accessible.length
      ? db
          .select({
            id: leases.id,
            startDate: leases.startDate,
            endDate: leases.endDate,
            rentAmount: leases.rentAmount,
            status: leases.status,
          })
          .from(leases)
          .innerJoin(units, eq(leases.unitId, units.id))
          .where(
            and(
              inArray(units.propertyId, accessible),
              lte(leases.startDate, new Date(monthEndUtc - DAY_MS)),
            ),
          )
      : Promise.resolve([]),
    accessible.length
      ? db
          .select({
            status: maintenanceRequests.status,
            createdAt: maintenanceRequests.createdAt,
            resolvedAt: maintenanceRequests.resolvedAt,
          })
          .from(maintenanceRequests)
          .where(inArray(maintenanceRequests.propertyId, accessible))
      : Promise.resolve([]),
  ]);

  const leaseIds = leaseRows.map((l) => l.id);
  const paymentRows: PaymentRow[] = leaseIds.length
    ? await db
        .select({
          leaseId: payments.leaseId,
          amount: payments.amount,
          paidDate: payments.paidDate,
        })
        .from(payments)
        .where(inArray(payments.leaseId, leaseIds))
    : [];

  // ---- Level -------------------------------------------------------------
  const xp = Number(xpAgg[0]?.total ?? 0);
  const xpThisWeek = Number(xpAgg[0]?.thisWeek ?? 0);
  const level = levelForXp(xp);

  // ---- Health score components -------------------------------------------
  const components: HealthComponent[] = [];

  const totalUnits = unitRows.length;
  if (totalUnits > 0) {
    const occupied = unitRows.filter((u) => u.status === "occupied").length;
    components.push({
      key: "occupancy",
      label: "Occupancy",
      score: Math.round((occupied / totalUnits) * 100),
      applicable: true,
      detail: `${occupied} of ${totalUnits} units occupied`,
    });
  }

  const activeThisMonth = leaseRows.filter(
    (l) =>
      l.status === "active" &&
      l.startDate.getTime() < monthEndUtc &&
      (!l.endDate || l.endDate.getTime() >= monthStartUtc),
  );
  if (activeThisMonth.length > 0) {
    const { due, leaseIds: dueIds } = rentDueForMonth(
      leaseRows,
      monthStartUtc,
      monthEndUtc,
    );
    const paid = paymentRows
      .filter(
        (p) =>
          p.leaseId &&
          dueIds.has(p.leaseId) &&
          p.paidDate.getTime() >= monthStartUtc &&
          p.paidDate.getTime() < monthEndUtc,
      )
      .reduce((sum, p) => sum + Number(p.amount), 0);
    if (due > 0) {
      components.push({
        key: "collection",
        label: "Rent collection",
        score: Math.min(100, Math.round((paid / due) * 100)),
        applicable: true,
        detail: `${formatCurrency(paid)} of ${formatCurrency(due)} collected this month`,
      });
    }
  }

  const trackedRequests = maintRows.filter((r) => r.status !== "cancelled");
  if (trackedRequests.length > 0) {
    const open = trackedRequests.filter(
      (r) => r.status === "new" || r.status === "in_progress",
    ).length;
    components.push({
      key: "maintenance",
      label: "Maintenance",
      score: Math.max(0, 100 - 15 * open),
      applicable: true,
      detail:
        open === 0
          ? `All ${trackedRequests.length} requests handled`
          : `${open} request${open === 1 ? "" : "s"} still open`,
    });
  }

  const activeLeases = leaseRows.filter(
    (l) =>
      l.status === "active" &&
      l.endDate &&
      l.endDate.getTime() >= todayUtc,
  );
  if (activeLeases.length > 0) {
    const expiring = activeLeases.filter(
      (l) => l.endDate!.getTime() <= leaseRiskThreshold,
    ).length;
    components.push({
      key: "lease_stability",
      label: "Lease stability",
      score: Math.max(0, 100 - 30 * expiring),
      applicable: true,
      detail:
        expiring === 0
          ? "No leases ending soon"
          : `${expiring} lease${expiring === 1 ? "" : "s"} end${expiring === 1 ? "s" : ""} within ${LEASE_RISK_DAYS} days`,
    });
  }

  const healthScore = components.length
    ? Math.round(
        components.reduce(
          (sum, c) => sum + c.score * HEALTH_WEIGHTS[c.key],
          0,
        ) / components.reduce((sum, c) => sum + HEALTH_WEIGHTS[c.key], 0),
      )
    : null;

  // ---- Perfect-collection streak (completed months only) ------------------
  let streakMonths = 0;
  if (leaseRows.length > 0 && paymentRows.length > 0) {
    for (let i = 1; i <= STREAK_LOOKBACK_MONTHS; i++) {
      const start = Date.UTC(y, m - i, 1);
      const end = Date.UTC(y, m - i + 1, 1); // exclusive
      const { due, leaseIds: monthIds } = rentDueForMonth(leaseRows, start, end);
      if (due <= 0) break; // no rent due that month — streak ends here
      const paid = paymentRows
        .filter(
          (p) =>
            p.leaseId &&
            monthIds.has(p.leaseId) &&
            p.paidDate.getTime() >= start &&
            p.paidDate.getTime() < end,
        )
        .reduce((sum, p) => sum + Number(p.amount), 0);
      if (paid + 0.005 < due) break;
      streakMonths += 1;
    }
  }

  // ---- Badge conditions ----------------------------------------------------
  const incomeTotal = paymentRows.reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );
  const occupiedUnits = unitRows.filter((u) => u.status === "occupied").length;
  const fastResolves = maintRows.filter(
    (r) =>
      r.resolvedAt &&
      r.resolvedAt.getTime() - r.createdAt.getTime() <= DAY_MS,
  ).length;

  const met = new Set<string>();
  if (accessible.length >= 1) met.add("first_property");
  if (accessible.length >= 5) met.add("portfolio_builder");
  if (totalUnits >= 3 && occupiedUnits === totalUnits) met.add("full_house");
  if (streakMonths >= 1) met.add("perfect_month");
  if (fastResolves >= 1) met.add("speed_runner");
  if (incomeTotal >= 100_000) met.add("six_figures");
  if (incomeTotal >= 500_000) met.add("tycoon");

  const unlockedAtByKey = new Map(
    achRows.map((r) => [r.key, r.unlockedAt] as const),
  );
  const justUnlocked = [...met].filter((k) => !unlockedAtByKey.has(k));
  if (justUnlocked.length > 0) {
    try {
      await db
        .insert(achievements)
        .values(justUnlocked.map((key) => ({ userId, key })))
        .onConflictDoNothing();
    } catch {
      // Best-effort — the badge will be recorded on the next load.
    }
  }

  const nowIso = now.toISOString();
  const badges: BadgeState[] = BADGES.map((def) => {
    const unlockedAt = unlockedAtByKey.get(def.key);
    return {
      ...def,
      unlockedAt: unlockedAt
        ? unlockedAt.toISOString()
        : justUnlocked.includes(def.key)
          ? nowIso
          : null,
    };
  });

  return {
    level,
    levelTitle: levelTitle(level),
    xp,
    xpThisWeek,
    currentLevelXp: levelFloor(level),
    nextLevelXp: level < 999 ? levelFloor(level + 1) : null,
    healthScore,
    healthComponents: components,
    streakMonths,
    badges,
    justUnlocked,
  };
}
