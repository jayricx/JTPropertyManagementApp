import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  featureRequests,
  featureRequestUpdates,
  users,
} from "@/db/schema";

/**
 * Feature requests — the landlord asking for something that doesn't exist yet.
 *
 * Submissions are private to their author and to the owner. Publicity is a
 * deliberate act (the owner sets `isPublic`), and the roadmap never shows who
 * asked: a landlord naming a unit and a tenant in public is a privacy leak.
 */

export type FeatureRequestCategory =
  | "properties"
  | "leases"
  | "tenants"
  | "rent_collection"
  | "maintenance"
  | "reports"
  | "tenant_portal"
  | "integrations"
  | "other";

export type FeatureRequestStatus =
  | "submitted"
  | "under_review"
  | "planned"
  | "shipped"
  | "declined";

export const FEATURE_REQUEST_CATEGORIES: {
  value: FeatureRequestCategory;
  label: string;
}[] = [
  { value: "properties", label: "Properties & units" },
  { value: "leases", label: "Leases & documents" },
  { value: "tenants", label: "Tenants" },
  { value: "rent_collection", label: "Rent collection" },
  { value: "maintenance", label: "Maintenance" },
  { value: "reports", label: "Reports & exports" },
  { value: "tenant_portal", label: "Tenant portal" },
  { value: "integrations", label: "Integrations & exports" },
  { value: "other", label: "Something else" },
];

export const CATEGORY_LABELS: Record<FeatureRequestCategory, string> =
  Object.fromEntries(
    FEATURE_REQUEST_CATEGORIES.map((c) => [c.value, c.label]),
  ) as Record<FeatureRequestCategory, string>;

export const STATUS_LABELS: Record<FeatureRequestStatus, string> = {
  submitted: "Submitted",
  under_review: "Looking at it",
  planned: "Planned",
  shipped: "Shipped",
  declined: "Not planned",
};

/** Roadmap grouping: only the statuses worth showing a stranger. */
export const ROADMAP_STATUSES: FeatureRequestStatus[] = [
  "planned",
  "under_review",
  "shipped",
];

export const STATUS_HELP: Record<FeatureRequestStatus, string> = {
  submitted: "We have your idea. Nothing to do yet.",
  under_review: "We're working out whether and how to build it.",
  planned: "It's on the list to build.",
  shipped: "This is in the app.",
  declined: "We won't be building this — see the note below.",
};

/** A landlord can't have an unbounded number of open asks in flight. */
export const MAX_OPEN_REQUESTS = 3;
const OPEN_STATUSES: FeatureRequestStatus[] = [
  "submitted",
  "under_review",
  "planned",
];

export interface FeatureRequestRow {
  id: string;
  title: string;
  details: string;
  category: FeatureRequestCategory;
  status: FeatureRequestStatus;
  planAtSubmission: string | null;
  isPublic: boolean;
  createdAt: Date;
  updates: { status: FeatureRequestStatus; note: string | null; createdAt: Date }[];
}

/** A user's own requests, newest first, with their status history. */
export async function requestsForUser(userId: string): Promise<FeatureRequestRow[]> {
  const rows = await db
    .select()
    .from(featureRequests)
    .where(eq(featureRequests.userId, userId))
    .orderBy(desc(featureRequests.createdAt));

  if (rows.length === 0) return [];

  const history = await db
    .select()
    .from(featureRequestUpdates)
    .where(
      inArray(
        featureRequestUpdates.requestId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(featureRequestUpdates.createdAt));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    details: row.details,
    category: row.category,
    status: row.status,
    planAtSubmission: row.planAtSubmission,
    isPublic: row.isPublic,
    createdAt: row.createdAt,
    updates: history
      .filter((h) => h.requestId === row.id)
      .map((h) => ({ status: h.status, note: h.note, createdAt: h.createdAt })),
  }));
}

export interface InboxRow extends FeatureRequestRow {
  /** The submitter — so the inbox can refuse to let you answer yourself. */
  userId: string;
  submitterName: string | null;
  submitterEmail: string;
  /** Requests this landlord has sent — a proxy for engagement. */
  requestCount: number;
}

/**
 * Every request, for the owner's triage view. Unit count is computed across the
 * submitter's own portfolios so the biggest landlords' asks surface first.
 */
export async function requestInbox(): Promise<InboxRow[]> {
  const rows = await db
    .select({
      id: featureRequests.id,
      title: featureRequests.title,
      details: featureRequests.details,
      category: featureRequests.category,
      status: featureRequests.status,
      planAtSubmission: featureRequests.planAtSubmission,
      isPublic: featureRequests.isPublic,
      createdAt: featureRequests.createdAt,
      userId: featureRequests.userId,
      submitterName: users.name,
      submitterEmail: users.email,
    })
    .from(featureRequests)
    .innerJoin(users, eq(featureRequests.userId, users.id))
    .orderBy(desc(featureRequests.createdAt));

  const withHistory = await withUpdates(rows);
  const counts = await requestCountsBySubmitter(
    rows.map((r) => r.userId),
  );

  return withHistory.map((row) => ({
    ...row,
    requestCount: counts.get(row.userId) ?? 0,
  }));
}

/** The public roadmap: curated requests only, with no identity attached. */
export async function publicRoadmap(): Promise<
  { id: string; title: string; details: string; status: FeatureRequestStatus; category: FeatureRequestCategory; updatedAt: Date }[]
> {
  return db
    .select({
      id: featureRequests.id,
      title: featureRequests.title,
      details: featureRequests.details,
      status: featureRequests.status,
      category: featureRequests.category,
      updatedAt: featureRequests.updatedAt,
    })
    .from(featureRequests)
    .where(eq(featureRequests.isPublic, true))
    .orderBy(desc(featureRequests.updatedAt));
}

/** How many open requests a landlord already has. */
export async function openRequestCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(featureRequests)
    .where(
      and(
        eq(featureRequests.userId, userId),
        inArray(featureRequests.status, OPEN_STATUSES),
      ),
    );
  return Number(row?.n ?? 0);
}

async function withUpdates<
  T extends {
    id: string;
    title: string;
    details: string;
    category: FeatureRequestCategory;
    status: FeatureRequestStatus;
    planAtSubmission: string | null;
    isPublic: boolean;
    createdAt: Date;
  },
>(rows: T[]): Promise<(Omit<T, "id"> & FeatureRequestRow)[]> {
  if (rows.length === 0) return [];
  const history = await db
    .select()
    .from(featureRequestUpdates)
    .where(
      inArray(
        featureRequestUpdates.requestId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(featureRequestUpdates.createdAt));

  return rows.map(({ id, ...rest }) => ({
    ...rest,
    id,
    updates: history
      .filter((h) => h.requestId === id)
      .map((h) => ({ status: h.status, note: h.note, createdAt: h.createdAt })),
  }));
}

/** How many requests each submitter has sent — a proxy for engagement. */
async function requestCountsBySubmitter(
  userIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;

  const rows = await db
    .select({ userId: featureRequests.userId, n: count() })
    .from(featureRequests)
    .where(inArray(featureRequests.userId, userIds))
    .groupBy(featureRequests.userId);
  for (const row of rows) out.set(row.userId, Number(row.n));
  return out;
}