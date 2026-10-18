import { and, desc, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { accessiblePropertyIds } from "@/lib/access";
import { aiJson, clampNumber, type AiSource } from "@/lib/ai";
import {
  expenseCategories,
  type ExpenseCategory,
} from "@/lib/validations";

export interface ExpenseSuggestion {
  category: ExpenseCategory;
  /** 0–1, how much to trust this. */
  confidence: number;
  /** One short line explaining the pick, shown in the UI. */
  reason: string;
  source: AiSource;
}

/**
 * Philippine landlords file expenses against the same handful of vendors
 * over and over, so "what did I file this as last time" beats any keyword
 * guess — and it is honest: it is the user's own bookkeeping.
 */
const VENDOR_KEYWORDS: Record<ExpenseCategory, string[]> = {
  utilities: [
    "meralco", "manila electric", "mec", "electric", "power", "electricity",
    "water", "maynilad", "sewage", "waste", "internet", "globe", "smart",
    "tnt", "broadband", "cable", "wifi", "fiber", "generator fuel",
  ],
  repair: [
    "plumb", "repair", "fix", "maint", "maintenance", "electrician", "carpenter",
    "paint", "roofer", "aircon", "ac service", "pest", "termite", "locksmith",
    "welder", "glass", "tiling",
  ],
  // The enum also carries `maintenance` separately from `repair`: recurring
  // servicing (lift, generator, pest control) lands here, one-off fixes in
  // `repair`.
  maintenance: [
    "maintenance service", "servicing", "lift", "elevator", "generator",
    "pest control", "termite treatment", "cleaning service", "laundry",
    "grass cutting", "landscaping",
  ],
  tax: [
    "bir", "tax", "dible", "real estate tax", "transfer tax", "business tax",
    "permit", "mayor's permit",
  ],
  insurance: [
    "insurance", "axis", "prudential", "chubb", "western union",
  ],
  hoa: ["hoa", "condominium", "condo", "association"],
  supplies: [
    "paint", "paintboy", "hardware", "home depot", "ace hardware", "sm store",
    "screw", "plywood", "cement", "sand", "holcim", "tile", "fixture",
    "supply", "materials", "cleaning", "broom", "detergent", "tape",
    "lightbulb", "gi",
  ],
  other: [],
};

/**
 * Suggest a category for a new expense.
 *
 * Order of trust: this landlord's own history for that vendor (repeat bills
 * are the common case), then the model when one is configured, then
 * vendor/notes keywords. Returns null when nothing has a signal — the UI
 * then shows nothing rather than a weak guess.
 */
export async function suggestExpenseCategory({
  userId,
  vendor,
  notes,
}: {
  userId: string;
  vendor: string;
  notes: string;
}): Promise<ExpenseSuggestion | null> {
  const cleanVendor = vendor.trim();
  const haystack = `${cleanVendor} ${notes}`.trim().toLowerCase();

  // 1. History — what did this vendor cost before? Scoped to the properties
  // in context, not the creator, so a co-owner's spending counts too.
  if (cleanVendor.length >= 3) {
    const propertyIds = await accessiblePropertyIds(userId);
    const past = propertyIds.length
      ? await db
          .select({ category: expenses.category })
          .from(expenses)
          .where(
            and(
              inArray(expenses.propertyId, propertyIds),
              sql`lower(${expenses.vendor}) = ${cleanVendor.toLowerCase()}`,
            ),
          )
          .limit(50)
      : [];
    if (past.length > 0) {
      const counts = new Map<ExpenseCategory, number>();
      for (const row of past) {
        counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
      }
      const [category, hits] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        category,
        confidence: hits / past.length >= 0.8 ? 0.9 : 0.7,
        reason: `You filed ${hits} of ${past.length} past ${cleanVendor} expenses as this`,
        source: "rules",
      };
    }
  }

  // 2. The model, when one is configured.
  if (process.env.AI_API_KEY) {
    const answer = await aiJson<{
      category: string;
      confidence: number;
      reason: string;
    }>({
      system:
        "You categorise expenses for a Philippine landlord. Reply with JSON only: " +
        '{"category": string, "confidence": number 0-1, "reason": string}. ' +
        `Allowed categories: ${expenseCategories.join(", ")}.`,
      user: `Vendor: ${cleanVendor || "(unknown)"}\nNotes: ${notes || "(none)"}`,
      maxTokens: 200,
    });
    const category = answer?.category as ExpenseCategory;
    if (answer && expenseCategories.includes(category)) {
      return {
        category,
        confidence: clampNumber(answer.confidence, { min: 0, max: 1 }) ?? 0.7,
        reason: String(answer.reason ?? "").slice(0, 160) || "Based on the details",
        source: "ai",
      };
    }
  }

  // 3. Keywords.
  let best: { category: ExpenseCategory; hits: number; term: string } | null = null;
  for (const category of expenseCategories) {
    for (const term of VENDOR_KEYWORDS[category] ?? []) {
      if (!haystack.includes(term)) continue;
      if (!best || term.length > best.term.length) {
        best = { category, hits: category === "repair" ? 1 : 1, term };
      }
    }
  }
  if (!best) return null;
  return {
    category: best.category,
    confidence: 0.6,
    reason: `“${best.term}” looks like ${best.category}`,
    source: "rules",
  };
}

/**
 * Distinct categories this landlord already uses — fed to the model.
 *
 * Scoped to the properties in context rather than to the creator, so a
 * co-owner's expenses inform the suggestions too (previously each member only
 * saw their own history, and the owner's suggestions ignored the co-owner's).
 */
export async function categoryHistory(
  userId: string,
): Promise<{ category: ExpenseCategory; count: number }[]> {
  const propertyIds = await accessiblePropertyIds(userId);
  const rows = propertyIds.length
    ? await db
        .select({ category: expenses.category, count: sql<number>`count(*)::int` })
        .from(expenses)
        .where(inArray(expenses.propertyId, propertyIds))
        .groupBy(expenses.category)
        .orderBy(desc(sql`count(*)`))
    : [];
  return rows.map((r) => ({
    category: r.category as ExpenseCategory,
    count: Number(r.count),
  }));
}