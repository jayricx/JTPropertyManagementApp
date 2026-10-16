import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { properties, units } from "@/db/schema";
import { aiJson, clampNumber, type AiSource } from "@/lib/ai";

export interface RentSuggestion {
  suggestedRent: number;
  low: number;
  high: number;
  /** 0–1 — how many comparables backed the number. */
  confidence: number;
  headline: string;
  reasons: string[];
  source: AiSource;
}

export interface Comparable {
  label: string;
  rent: number;
  occupied: boolean;
  sameProperty: boolean;
}

function roundTo500(value: number): number {
  return Math.max(500, Math.round(value / 500) * 500);
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/**
 * Rent suggestion from the landlord's own portfolio: what comparable units
 * in the same property (then the same city) actually charge, weighted
 * toward the ones that are actually occupied. No market data is claimed —
 * the reasons string says exactly what it looked at.
 *
 * With a model configured the same comparables are handed over for a
 * considered judgement, clamped to a band around the computed median so a
 * hallucinated number can't escape into the UI.
 */
export async function suggestRentForUnit({
  unitId,
  propertyId,
}: {
  /** Existing unit — comparables are its siblings. */
  unitId?: string;
  /** New unit — comparables are the property's other units. */
  propertyId?: string;
}): Promise<RentSuggestion | null> {
  let target: { id: string; propertyId: string; city: string | null } | null = null;

  if (unitId) {
    const [row] = await db
      .select({
        id: units.id,
        propertyId: units.propertyId,
        city: properties.city,
      })
      .from(units)
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(eq(units.id, unitId))
      .limit(1);
    target = row ?? null;
  } else if (propertyId) {
    const [row] = await db
      .select({ id: properties.id, city: properties.city })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    if (row) {
      target = { id: row.id, propertyId: row.id, city: row.city };
    }
  }
  if (!target) return null;

  // Siblings first, then the rest of the city as a wider fallback.
  const cityUnits = target.city
    ? await db
        .select({
          id: units.id,
          propertyId: units.propertyId,
          rent: units.rentAmount,
          status: units.status,
        })
        .from(units)
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .where(
          and(
            eq(properties.city, target.city),
            sql`${units.rentAmount} is not null`,
            sql`${units.rentAmount} > 0`,
          ),
        )
        .limit(60)
    : [];

  const comparables: Comparable[] = cityUnits
    .filter((u) => u.id !== target!.id && (unitId || propertyId))
    .map((u) => ({
      label: "",
      rent: Number(u.rent),
      occupied: u.status === "occupied",
      sameProperty: u.propertyId === target!.propertyId,
    }));

  const close = comparables.filter((c) => c.sameProperty);
  const pool = close.length >= 2 ? close : comparables;
  if (!pool.length) return null;

  const rents = pool.map((c) => c.rent);
  const occupiedCount = pool.filter((c) => c.occupied).length;

  // Weighted median: occupied units count double, because a rent only an
  // occupied unit charges is a rent the market has actually accepted.
  const weighted = pool
    .map((c) => ({ rent: c.rent, weight: c.occupied ? 2 : 1 }))
    .sort((a, b) => a.rent - b.rent);
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let running = 0;
  let median = weighted[weighted.length - 1].rent;
  for (const entry of weighted) {
    running += entry.weight;
    if (running >= totalWeight / 2) {
      median = entry.rent;
      break;
    }
  }

  const rulesSuggestion: RentSuggestion = {
    suggestedRent: roundTo500(median),
    low: roundTo500(percentile(rents, 0.25)),
    high: roundTo500(percentile(rents, 0.75)),
    confidence: Math.min(0.85, 0.35 + pool.length * 0.1),
    headline: `₱${roundTo500(median).toLocaleString("en-PH")} based on ${pool.length} comparable unit${pool.length === 1 ? "" : "s"}`,
    reasons: [
      `${close.length >= 2 ? "Same property" : "Same city"}: ${pool.length} unit${pool.length === 1 ? "" : "s"} charging ₱${Math.min(...rents).toLocaleString("en-PH")}–₱${Math.max(...rents).toLocaleString("en-PH")}`,
      `${occupiedCount} of ${pool.length} comparable${occupiedCount === 1 ? " is" : "s are"} currently occupied`,
      "Occupied units weigh double, since that rent is one the market has accepted",
    ],
    source: "rules",
  };

  if (!process.env.AI_API_KEY) return rulesSuggestion;

  const answer = await aiJson<{
    suggestedRent: number;
    low: number;
    high: number;
    reasons: string[];
  }>({
    system:
      "You advise a Philippine landlord on rent for a residential unit. You are given " +
      "comparable units from the landlord's own portfolio (city, rent, occupancy). " +
      "Reply with JSON only: {suggestedRent, low, high, reasons[]}, amounts in pesos, " +
      "reasons as 1-3 short sentences. Be practical, never optimistic.",
    user: [
      `City: ${target.city ?? "unknown"}`,
      `Comparables: ${pool
        .map(
          (c) =>
            `₱${c.rent.toLocaleString("en-PH")} (${c.occupied ? "occupied" : "vacant"}, ${c.sameProperty ? "same property" : "other property"})`,
        )
        .join("; ")}`,
    ].join("\n"),
    maxTokens: 400,
  });

  const suggested = clampNumber(answer?.suggestedRent, {
    // Never let the model escape the observed band by more than ~60%.
    min: median * 0.6,
    max: median * 1.6,
  });
  if (!suggested || !answer) return rulesSuggestion;

  return {
    suggestedRent: roundTo500(suggested),
    low: roundTo500(clampNumber(answer.low, { min: median * 0.5, max: median * 1.2 }) ?? rulesSuggestion.low),
    high: roundTo500(clampNumber(answer.high, { min: median * 0.8, max: median * 2 }) ?? rulesSuggestion.high),
    confidence: Math.min(rulesSuggestion.confidence + 0.1, 0.9),
    headline: `₱${roundTo500(suggested).toLocaleString("en-PH")} suggested from ${pool.length} comparable unit${pool.length === 1 ? "" : "s"}`,
    reasons: Array.isArray(answer.reasons)
      ? answer.reasons.slice(0, 3).map((r) => String(r).slice(0, 140))
      : rulesSuggestion.reasons,
    source: "ai",
  };
}

/** Rents + occupancy for a property's units, for the property page. */
export async function propertyRentSummary(
  propertyId: string,
): Promise<{ count: number; occupied: number; median: number | null }> {
  const rows = await db
    .select({ rent: units.rentAmount, status: units.status })
    .from(units)
    .where(
      and(
        eq(units.propertyId, propertyId),
        sql`${units.rentAmount} is not null`,
        sql`${units.rentAmount} > 0`,
      ),
    );
  if (!rows.length) return { count: 0, occupied: 0, median: null };
  const rents = rows.map((r) => Number(r.rent)).sort((a, b) => a - b);
  const mid = Math.floor(rents.length / 2);
  const median =
    rents.length % 2 === 0
      ? (rents[mid - 1] + rents[mid]) / 2
      : rents[mid];
  return {
    count: rows.length,
    occupied: rows.filter((r) => r.status === "occupied").length,
    median,
  };
}