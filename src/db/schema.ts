import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Auth.js tables (used by @auth/drizzle-adapter)
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", ["landlord", "tenant"]);
export const planTierEnum = pgEnum("plan_tier", [
  "free",
  "starter",
  "pro",
  "business",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: varchar("image", { length: 255 }),
  // App-specific columns (ignored by the Auth.js adapter)
  passwordHash: varchar("password_hash", { length: 255 }),
  // Stamped whenever the password changes. Sessions carry a copy of this
  // value, so a reset signs out every device that signed in before it.
  passwordChangedAt: timestamp("password_changed_at", { mode: "date" }),
  // Landlords run the dashboard; tenant accounts only ever see the portal.
  role: userRoleEnum("role").default("landlord").notNull(),
  // Subscription/usage tier. Defaults to free for new signups.
  plan: planTierEnum("plan").default("free").notNull(),
  // Landlord payout details for the tenant portal's GCash pay-rent flow.
  // Tenants send rent to this wallet and submit the reference number.
  gcashNumber: varchar("gcash_number", { length: 20 }),
  gcashName: varchar("gcash_name", { length: 255 }),
  /**
   * The people who run Renta-PH.net. Not a permission on landlord data — a
   * landlord's own portfolio still only shows them their own records — it just
   * unlocks the feature-request inbox and the public roadmap.
   */
  isAdmin: boolean("is_admin").default(false).notNull(),
  /**
   * The lease-calendar feed token. The ICS feed at /api/calendar/renta-ph.ics
   * authenticates with this alone — a phone's calendar app can subscribe by
   * URL and can send no headers, so the token rides in the query string.
   * Regenerating it cuts off a leaked link without touching anything else.
   */
  calendarFeedToken: varchar("calendar_feed_token", { length: 64 }),
  /**
   * The affiliate whose link brought this account in. Set once, at creation,
   * and never rewritten — attribution is first-touch, so the person who
   * introduced a landlord keeps the credit even if they later click someone
   * else's link. Null for anyone who arrived without one, which is most
   * accounts.
   */
  referredBy: uuid("referred_by").references((): AnyPgColumn => affiliates.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "account",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (t) => [
    unique("account_provider_provider_account_id_key").on(t.provider, t.providerAccountId),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [
    unique("verification_token_identifier_token_key").on(t.identifier, t.token),
  ],
);

export const authenticators = pgTable(
  "authenticator",
  {
    credentialID: varchar("credential_id", { length: 255 }).notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    credentialPublicKey: varchar("credential_public_key", { length: 255 }).notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: varchar("credential_device_type", { length: 255 }).notNull(),
    credentialBackedUp: boolean("credential_backed_up").notNull(),
    transports: varchar("transports", { length: 255 }),
  },
  (t) => [
    unique("authenticator_user_id_credential_id_key").on(t.userId, t.credentialID),
  ],
);

// ---------------------------------------------------------------------------
// App tables
// ---------------------------------------------------------------------------

export const propertyTypeEnum = pgEnum("property_type", [
  "apartment",
  "house",
  "condo",
  "townhouse",
  "duplex",
  "commercial",
  "other",
]);

// ---------------------------------------------------------------------------
// Portfolios — the central bucket. Properties, leases, tenants and
// custom-field definitions belong to a portfolio; accounts are granted
// access through `portfolio_members` with a role. One portfolio per user is
// provisioned silently, so a solo owner never sees this concept unless they
// invite a co-owner or create a second portfolio.
// ---------------------------------------------------------------------------

export const portfolioRoleEnum = pgEnum("portfolio_role", [
  "owner",
  "co_owner",
  "viewer",
]);

export const portfolios = pgTable(
  "portfolios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    /**
     * The paying account. RESTRICT, never CASCADE: an account that owns a
     * portfolio cannot be deleted until ownership moves or the portfolio is
     * deleted deliberately. Always has a matching `owner` membership row.
     */
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /**
     * The trading name the landlord contracts under — "Santos Property
     * Holdings" rather than "Jayric Tumon". It appears on lease contracts in
     * place of the personal name, which matters because on a lease the
     * counterparty has to be identifiable rather than merely the account
     * holder. Portfolio-scoped, not per-user, so co-owners see one consistent
     * name, and edited only by the owner because it names who is contracting.
     */
    businessName: varchar("business_name", { length: 200 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("portfolios_owner_user_id_idx").on(t.ownerUserId)],
);

/**
 * Portfolio access. `owner` is full control (including field definitions,
 * members and payout details), `co_owner` manages properties/tenants/leases
 * and custom-field *values*, `viewer` is read-only.
 */
export const portfolioMembers = pgTable(
  "portfolio_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: portfolioRoleEnum("role").default("co_owner").notNull(),
    addedBy: uuid("added_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("portfolio_members_portfolio_user_key").on(t.portfolioId, t.userId),
    index("portfolio_members_user_id_idx").on(t.userId),
  ],
);

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** The bucket this property belongs to. RESTRICT: never cascade-delete. */
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    address: varchar("address", { length: 500 }),
    city: varchar("city", { length: 255 }),
    state: varchar("state", { length: 100 }),
    zipCode: varchar("zip_code", { length: 20 }),
    country: varchar("country", { length: 100 }),
    type: propertyTypeEnum("type").default("other").notNull(),
    notes: text("notes"),
    customFields: text("custom_fields").default("{}").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("properties_portfolio_id_idx").on(t.portfolioId)],
);

export const unitStatusEnum = pgEnum("unit_status", [
  "vacant",
  "occupied",
  "maintenance",
]);

export const units = pgTable(
  "units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    bedrooms: integer("bedrooms"),
    bathrooms: numeric("bathrooms", { precision: 3, scale: 1 }),
    rentAmount: numeric("rent_amount", { precision: 12, scale: 2 }),
    sqm: integer("sqm"),
    status: unitStatusEnum("status").default("vacant").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("units_property_id_idx").on(t.propertyId)],
);

// ---------------------------------------------------------------------------
// Utility meters — electricity and water sub-meters on a unit. A landlord
// reads each meter every month and bills the tenant for consumption × rate.
// `rate` is ₱ per consumption unit (kWh for electric, m³ for water); each
// reading snapshots the rate so changing it never rewrites past bills.
// ---------------------------------------------------------------------------

export const meterTypeEnum = pgEnum("meter_type", ["electric", "water"]);

export const meters = pgTable(
  "meters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    type: meterTypeEnum("type").notNull(),
    label: varchar("label", { length: 100 }),
    /** ₱ per consumption unit (kWh or m³), 4 decimals for exact Meralco rates. */
    rate: numeric("rate", { precision: 12, scale: 4 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("meters_unit_type_key").on(t.unitId, t.type),
    index("meters_unit_id_idx").on(t.unitId),
  ],
);

export const meterReadings = pgTable(
  "meter_readings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meterId: uuid("meter_id")
      .notNull()
      .references(() => meters.id, { onDelete: "cascade" }),
    /** Billing month, "YYYY-MM". One reading per meter per month. */
    periodMonth: varchar("period_month", { length: 7 }).notNull(),
    readingDate: date("reading_date", { mode: "date" }).notNull(),
    previousReading: numeric("previous_reading", { precision: 14, scale: 2 }).notNull(),
    currentReading: numeric("current_reading", { precision: 14, scale: 2 }).notNull(),
    /** current − previous, snapshotted at entry. */
    consumption: numeric("consumption", { precision: 14, scale: 2 }).notNull(),
    /** Rate at entry time, snapshotted so history never shifts. */
    rate: numeric("rate", { precision: 12, scale: 4 }).notNull(),
    /** consumption × rate, snapshotted. */
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("meter_readings_meter_period_key").on(t.meterId, t.periodMonth),
    index("meter_readings_meter_id_idx").on(t.meterId),
  ],
);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Who created this roster entry (kept for authorship, not access). */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * The portfolio that owns this tenant. Access is scoped by membership of
     * this portfolio, so every member sees the whole roster — a co-owner no
     * longer meets a read-only "co-owner's tenant" silo.
     */
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "restrict" }),
    // Portal login: links this roster entry to a user account. The invite
    // flow keeps one tenant profile per account, but the account need not be
    // tenant-role — an owner who rents from another owner is linked too.
    // Deleting an account keeps the roster row (set null).
    accountId: uuid("account_id").references(() => users.id, {
      onDelete: "set null",
    }),
    firstName: varchar("first_name", { length: 255 }).notNull(),
    lastName: varchar("last_name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    notes: text("notes"),
    customFields: text("custom_fields").default("{}").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("tenants_user_id_idx").on(t.userId),
    index("tenants_portfolio_id_idx").on(t.portfolioId),
  ],
);

export const leaseStatusEnum = pgEnum("lease_status", [
  "upcoming",
  "active",
  "ended",
]);

export const leases = pgTable(
  "leases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "date" }).notNull(),
    endDate: date("end_date", { mode: "date" }),
    /**
     * The day of the month rent falls due (1–31), anchoring the lease's billing
     * periods.
     *
     * Null means "the same day the tenant moved in", which is both the default
     * and the common case — so every existing lease keeps working unchanged
     * without a backfill. Set explicitly only for the "moved in mid-month, rent
     * due on the 1st" arrangement, which is common enough to be worth a field.
     */
    rentDueDay: integer("rent_due_day"),
    rentAmount: numeric("rent_amount", { precision: 12, scale: 2 }).notNull(),
    depositAmount: numeric("deposit_amount", { precision: 12, scale: 2 })
      .default("0")
      .notNull(),
    depositReturned: boolean("deposit_returned").default(false).notNull(),
    status: leaseStatusEnum("status").default("active").notNull(),
    notes: text("notes"),
    customFields: text("custom_fields").default("{}").notNull(),
    // When the lease-end reminder email went out; reset if the end date moves.
    leaseEndReminderSentAt: timestamp("lease_end_reminder_sent_at", {
      mode: "date",
    }),
    // The billing period (its start date) a rent reminder was last sent for,
    // so the daily cron never nudges twice for the same period.
    rentReminderPeriodStart: date("rent_reminder_period_start", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("leases_unit_id_idx").on(t.unitId),
    index("leases_tenant_id_idx").on(t.tenantId),
  ],
);

// ---------------------------------------------------------------------------
// Lease contracts — a versioned, *frozen* snapshot of what was agreed.
//
// A signature on its own proves only that somebody typed a name: change the
// rent afterwards and the old signature would sit under the new figure. So the
// terms are snapshotted into `terms` at the moment of issue, rendered *only*
// from that snapshot, and hashed — what was signed can't change underneath the
// signature. Re-issuing writes version 2 rather than editing version 1, and
// editing the lease supersedes any contract still in flight.
// ---------------------------------------------------------------------------

export const contractStatusEnum = pgEnum("contract_status", [
  "draft",
  "sent",
  "viewed",
  "completed",
  "superseded",
  "voided",
]);

/** Statuses where a contract can still be worked on or signed. */
export const OPEN_CONTRACT_STATUSES = ["draft", "sent", "viewed"] as const;
export type ContractStatus = (typeof contractStatusEnum.enumValues)[number];

export const leaseContracts = pgTable(
  "lease_contracts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => leases.id, { onDelete: "cascade" }),
    /** 1, 2, 3… per lease. Never renumbered. */
    version: integer("version").notNull(),
    /** The frozen terms as JSON. The contract renders from this and nothing else. */
    terms: text("terms").notNull(),
    /** sha256 of the rendered text — proves which terms were signed. */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    status: contractStatusEnum("status").default("draft").notNull(),
    /** Who prepared it. RESTRICT: the audit trail outlives any account tidy-up. */
    issuedBy: uuid("issued_by").references(() => users.id, {
      onDelete: "restrict",
    }),
    issuedAt: timestamp("issued_at", { mode: "date" }),
    /** The tenant opened it — the "they've at least seen it" signal. */
    viewedAt: timestamp("viewed_at", { mode: "date" }),
    landlordSignedAt: timestamp("landlord_signed_at", { mode: "date" }),
    tenantSignedAt: timestamp("tenant_signed_at", { mode: "date" }),
    completedAt: timestamp("completed_at", { mode: "date" }),
    voidedAt: timestamp("voided_at", { mode: "date" }),
    /**
     * The emailed signing link. Only the hash is stored — the plaintext token
     * exists in the sent email and nowhere else, so a database leak doesn't
     * hand out live signing links. Rotated on every send, so the newest email
     * is the only one that works.
     */
    accessTokenHash: varchar("access_token_hash", { length: 64 }),
    accessExpiresAt: timestamp("access_expires_at", { mode: "date" }),
    lastSentAt: timestamp("last_sent_at", { mode: "date" }),
    sendCount: integer("send_count").default(0).notNull(),
    /**
     * Why the last send didn't arrive, if it didn't. The landlord needs to see
     * this: "sent" with no delivery and no error is the worst possible outcome.
     */
    lastSendError: text("last_send_error"),
    /** First chase, for a contract the tenant never opened. At most once. */
    firstReminderSentAt: timestamp("first_reminder_sent_at", { mode: "date" }),
    /** Second and final chase. */
    secondReminderSentAt: timestamp("second_reminder_sent_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("lease_contracts_lease_version_key").on(t.leaseId, t.version),
    index("lease_contracts_lease_id_idx").on(t.leaseId),
  ],
);

// ---------------------------------------------------------------------------
// Lease signatures — credential-free e-signing. DocuSign/Hellosign can slot
// in later (provider id + envelope columns); until then a party signs here
// with a typed name or a drawn mark.
//
// `contractId` binds a signature to the version of the terms that were actually
// on the table, so a completed contract keeps its evidence even after a later
// version is issued. It is nullable: a lease with no contract keeps the old
// behaviour (sign the summary), which is also why the uniqueness rules below
// are two partial indexes rather than one.
// ---------------------------------------------------------------------------

export const signatureRoleEnum = pgEnum("signature_role", [
  "landlord",
  "tenant",
]);

export const signatureMethodEnum = pgEnum("signature_method", [
  "typed",
  "drawn",
]);

/**
 * How the signer was identified. This is the evidentiary part: a signature is
 * an *attribute* until something ties it to a person, and a landlord staring
 * at a signed contract needs to know which one they have.
 *
 * `link_only` marks signatures taken before verification was required. They are
 * labelled rather than rewritten as verified, so the record stays honest about
 * what actually happened at the time.
 */
export const signatureVerifiedByEnum = pgEnum("signature_verified_by", [
  "email_code",
  "account",
  "link_only",
]);

export const leaseSignatures = pgTable(
  "lease_signatures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => leases.id, { onDelete: "cascade" }),
    contractId: uuid("contract_id").references(() => leaseContracts.id, {
      onDelete: "cascade",
    }),
    role: signatureRoleEnum("role").notNull(),
    signerName: varchar("signer_name", { length: 255 }).notNull(),
    method: signatureMethodEnum("method").notNull(),
    // Typed: the name as written. Drawn: a PNG data URL of the strokes.
    signature: text("signature").notNull(),
    signedAt: timestamp("signed_at", { mode: "date" }).defaultNow().notNull(),
    // How this party was identified. Null on pre-verification signatures.
    verifiedBy: signatureVerifiedByEnum("verified_by"),
    verifiedAt: timestamp("verified_at", { mode: "date" }),
    /** Signing evidence: where it happened, for the day it's disputed. */
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 500 }),
  },
  (t) => [
    // One mark per party per contract version…
    uniqueIndex("lease_signatures_contract_role_key")
      .on(t.contractId, t.role)
      .where(sql`${t.contractId} is not null`),
    // …and one per party per lease for the un-bound legacy signature.
    uniqueIndex("lease_signatures_lease_role_key")
      .on(t.leaseId, t.role)
      .where(sql`${t.contractId} is null`),
    index("lease_signatures_lease_id_idx").on(t.leaseId),
    index("lease_signatures_contract_id_idx").on(t.contractId),
  ],
);

/**
 * A one-time email code proving the signer controls the address the contract
 * was sent to. The signature itself records *that* verification happened; this
 * table holds only the short-lived challenge while it is in progress.
 *
 * Only an HMAC of the code is stored, keyed with AUTH_SECRET and bound to the
 * contract and role, so six digits can't be brute-forced from a database dump
 * and a code can't be replayed on another document.
 */
export const contractSignatureChallenges = pgTable(
  "contract_signature_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => leaseContracts.id, { onDelete: "cascade" }),
    role: signatureRoleEnum("role").notNull(),
    /** Where the code was sent — the address it is bound to. */
    email: varchar("email", { length: 255 }).notNull(),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    /** Wrong guesses so far; the challenge is dead once this hits the cap. */
    attempts: integer("attempts").default(0).notNull(),
    lastSentAt: timestamp("last_sent_at", { mode: "date" }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    /** Set the moment a code is accepted, so one code signs exactly once. */
    consumedAt: timestamp("consumed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    // One live challenge per party per contract version; requesting a new code
    // replaces the previous one rather than creating a second valid code.
    unique("contract_signature_challenges_contract_role_key").on(
      t.contractId,
      t.role,
    ),
    index("contract_signature_challenges_expires_at_idx").on(t.expiresAt),
  ],
);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "check",
  "bank_transfer",
  "gcash",
  "other",
]);

export const paymentTypeEnum = pgEnum("payment_type", [
  "rent",
  "deposit",
  "late_fee",
  "other",
]);

/**
 * Tenant GCash and bank-transfer submissions land as `pending` and only
 * count as income once the landlord verifies them against their wallet or
 * bank statement (`paid`), or are turned away (`rejected`). Records the
 * landlord enters themselves and manual backfills are `paid` from the start.
 */
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "rejected",
]);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leaseId: uuid("lease_id").references(() => leases.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paidDate: date("paid_date", { mode: "date" }).notNull(),
    method: paymentMethodEnum("method").default("other").notNull(),
    type: paymentTypeEnum("type").default("rent").notNull(),
    status: paymentStatusEnum("status").default("paid").notNull(),
    /** When the landlord approved or turned the payment away (null while pending). */
    reviewedAt: timestamp("reviewed_at", { mode: "date" }),
    /** Bank account ID if payment method is bank_transfer. */
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("payments_user_id_idx").on(t.userId),
    index("payments_lease_id_idx").on(t.leaseId),
    index("payments_bank_account_id_idx").on(t.bankAccountId),
  ],
);

// ---------------------------------------------------------------------------
// Charges — non-rent, non-meter amounts billed to a lease for a month:
// association dues, penalties, or a manual electricity/water share (for
// landlords who split the utility bill by proportion instead of sub-metering).
// Rent and sub-metered utilities are derived on the fly; these are the manual
// additions that complete a tenant's monthly statement.
// ---------------------------------------------------------------------------

export const chargeTypeEnum = pgEnum("charge_type", [
  "electricity",
  "water",
  "dues",
  "penalty",
  "other",
]);

export const charges = pgTable(
  "charges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => leases.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Legacy calendar month, "YYYY-MM". Superseded by `periodStart`; null on
     * anything filed since billing periods existed, and only read to place
     * those older rows.
     */
    periodMonth: varchar("period_month", { length: 7 }),
    /**
     * The billing period this charge belongs to, as exact dates.
     *
     * Dates rather than a month key because "March" is genuinely ambiguous
     * against a lease due on the 14th — the third is inside one period and the
     * fourteenth starts the next. A charge filed without dates cannot be placed
     * correctly, so entry now writes both boundaries.
     */
    periodStart: date("period_start", { mode: "date" }),
    periodEnd: date("period_end", { mode: "date" }),
    type: chargeTypeEnum("type").notNull(),
    description: varchar("description", { length: 255 }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("charges_lease_id_idx").on(t.leaseId),
    index("charges_user_id_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Expenses — the landlord's own spending per property (repairs, taxes,
// utilities they cover), kept separate from tenant-facing charges.
// ---------------------------------------------------------------------------

export const expenseCategoryEnum = pgEnum("expense_category", [
  "repair",
  "maintenance",
  "tax",
  "insurance",
  "utilities",
  "hoa",
  "supplies",
  "other",
]);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    category: expenseCategoryEnum("category").default("other").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    expenseDate: date("expense_date", { mode: "date" }).notNull(),
    vendor: varchar("vendor", { length: 255 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("expenses_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Password resets. Only the SHA-256 hash of a token is stored, so a leaked
// database row cannot be turned into a working reset link. Rows are
// single-use and expire.
// ---------------------------------------------------------------------------

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("password_reset_tokens_token_hash_key").on(t.tokenHash),
    index("password_reset_tokens_user_id_idx").on(t.userId),
  ],
);

/**
 * A registration that has been started but not yet proven to own the address.
 *
 * The account is deliberately *not* created until the emailed code comes back,
 * so an unverified address can never hold a usable login. One row per address:
 * a new attempt replaces the old one.
 */
export const tenantInvitations = pgTable(
  "tenant_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** SHA-256 of the emailed token — the token itself is never stored. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { mode: "date" }),
    lastSentAt: timestamp("last_sent_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("tenant_invitations_token_hash_key").on(t.tokenHash),
    index("tenant_invitations_tenant_id_idx").on(t.tenantId),
  ],
);

export const pendingRegistrations = pgTable(
  "pending_registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    /** HMAC of the emailed code — never the code itself. */
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    /** Wrong guesses so far; the row is dropped once this hits the cap. */
    attempts: integer("attempts").default(0).notNull(),
    lastSentAt: timestamp("last_sent_at", { mode: "date" }),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    /**
     * The referral code offered at signup, resolved later in `verify-code`.
     * Carried on the pending row because that row is the only thing that
     * survives between the two steps — the browser isn't trusted to hand the
     * same code back.
     */
    referralCode: varchar("referral_code", { length: 16 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("pending_registrations_email_key").on(t.email),
    index("pending_registrations_expires_at_idx").on(t.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Referrals — every landlord can share a code; these rows are the registry
// that keeps them unique, attributable and revocable.
//
// Deliberately a table of its own rather than a column on `users`. Once anyone
// can mint a link, the interesting state is *moderation*: pausing one spammer's
// code and recording why, without touching their account or losing the signups
// already attributed to it.
//
// `users.referred_by` points here rather than storing the code string, so a
// code can be rotated without rewriting anyone else's attribution. One user has
// at most one referrer, ever — attribution is first-touch and never
// overwritten.
// ---------------------------------------------------------------------------

export const affiliateStatusEnum = pgEnum("affiliate_status", [
  "active",
  "paused",
]);

export const affiliates = pgTable(
  "affiliates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Short and unambiguous: no O/0, I/1, so it survives being read aloud. */
    code: varchar("code", { length: 16 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /**
     * The account this code belongs to. Every holder is a user — codes are only
     * ever generated inside an account, so there is no "code with no owner".
     */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: affiliateStatusEnum("status").default("active").notNull(),
    /** Why a code was paused. Kept so the decision is auditable. */
    pausedReason: text("paused_reason"),
    notes: text("notes"),
    // Present from the start so Phase 3 needs no migration — deliberately
    // unused until there are paying customers to pay commission against.
    commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }),
    payoutStatus: varchar("payout_status", { length: 32 }).default("none"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("affiliates_code_key").on(t.code),
    unique("affiliates_user_id_key").on(t.userId),
    index("affiliates_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// Referral payouts — a fixed bounty for bringing in a landlord who actually
// collects rent, not merely signs up.
//
// Three decisions that matter, and all three are enforced here rather than in
// application code:
//
//  - **Once per account, ever.** UNIQUE on `referred_user_id`, so a referred
//    landlord paying rent for a decade still owes one bounty. Application-level
//    checks get bypassed by the second code path; a constraint doesn't.
//  - **Delayed, not immediate.** `payableAt` is a stored deadline rather than a
//    cron flip, so "what do I owe today" is answerable by comparison instead of
//    by whether a job happened to run. Rent gets refunded and subscriptions get
//    cancelled; thirty observed days of paying is what separates a customer
//    from a signup.
//  - **A fixed peso amount, not a percentage.** Percentages tie a liability to
//    pricing forever — at ₱399/mo, 20% of what a landlord *collects* costs six
//    times more than the subscription is worth.
// ---------------------------------------------------------------------------

export const referralPayoutStatusEnum = pgEnum("referral_payout_status", [
  "pending",
  "paid",
  "voided",
]);

export const referralPayouts = pgTable(
  "referral_payouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Who gets the money. */
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    /** The landlord whose first verified payment earned it. */
    referredUserId: uuid("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    status: referralPayoutStatusEnum("status").default("pending").notNull(),
    /** The payment that triggered it, kept for the audit trail. */
    triggeredByPaymentId: uuid("triggered_by_payment_id").references(
      () => payments.id,
      { onDelete: "set null" },
    ),
    triggeredAt: timestamp("triggered_at", { mode: "date" }).defaultNow().notNull(),
    /** Not owed until this moment — the delay that outlives a refund. */
    payableAt: timestamp("payable_at", { mode: "date" }).notNull(),
    paidAt: timestamp("paid_at", { mode: "date" }),
    /** How it was disbursed (GCash, bank transfer). Recorded, not assumed. */
    payoutMethod: varchar("payout_method", { length: 64 }),
    payoutReference: varchar("payout_reference", { length: 255 }),
    voidedReason: text("voided_reason"),
    note: text("note"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    // The once-ever rule, enforced by the database.
    unique("referral_payouts_referred_user_key").on(t.referredUserId),
    index("referral_payouts_affiliate_id_idx").on(t.affiliateId),
    index("referral_payouts_status_idx").on(t.status),
  ],
);

/**
 * Programme settings, as a single row (id is always 1).
 *
 * Exists so the programme can be paused without a deploy. Every referred
 * landlord accrues a real liability the moment their first payment verifies, and
 * at scale that number needs to be a dial rather than a code change.
 */
export const referralProgram = pgTable("referral_program", {
  id: integer("id").primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  bountyAmount: numeric("bounty_amount", { precision: 10, scale: 2 })
    .default("500.00")
    .notNull(),
  payoutDelayDays: integer("payout_delay_days").default(30).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const maintenanceStatusEnum = pgEnum("maintenance_status", [
  "new",
  "in_progress",
  "resolved",
  "cancelled",
]);

export const maintenancePriorityEnum = pgEnum("maintenance_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const maintenanceRequests = pgTable(
  "maintenance_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    status: maintenanceStatusEnum("status").default("new").notNull(),
    priority: maintenancePriorityEnum("priority").default("medium").notNull(),
    cost: numeric("cost", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
  },
  (t) => [
    index("maintenance_requests_user_id_idx").on(t.userId),
    index("maintenance_requests_unit_id_idx").on(t.unitId),
  ],
);

// ---------------------------------------------------------------------------
// Lease attachments — files live in Postgres as base64 text while object
// storage credentials are unavailable, which works on Vercel (where the
// filesystem is read-only) with no external service. `url` keeps the
// canonical path and is where an R2/S3 key goes later; `data` is null once
// that migration happens.
// ---------------------------------------------------------------------------

export const leaseNotes = pgTable(
  "lease_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => leases.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("lease_notes_lease_id_idx").on(t.leaseId)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    leaseId: uuid("lease_id").references(() => leases.id, { onDelete: "set null" }),
    // Photos/videos a tenant attached to the issue they reported.
    maintenanceRequestId: uuid("maintenance_request_id").references(
      () => maintenanceRequests.id,
      { onDelete: "cascade" },
    ),
    // A photo of the transfer receipt a tenant submitted with a GCash or bank
    // payment, so the landlord can verify it against their app history. Kept
    // when the payment is deleted — the evidence outlives the record.
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    /** Canonical path for DB-stored files; an object-storage key later. */
    url: varchar("url", { length: 1000 }).notNull(),
    type: varchar("type", { length: 100 }),
    sizeBytes: integer("size_bytes"),
    /** Base64 bytes, or null once objects move to R2/S3. */
    data: text("data"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("documents_lease_id_idx").on(t.leaseId),
    index("documents_property_id_idx").on(t.propertyId),
    index("documents_maintenance_request_id_idx").on(t.maintenanceRequestId),
    index("documents_payment_id_idx").on(t.paymentId),
  ],
);

// ---------------------------------------------------------------------------
// Custom fields — definitions and values per entity (property/lease/tenant).
// Definitions are scoped to the portfolio (`portfolioId`), so every member —
// including a co-owner — sees exactly the same fields. Values are stored as a
// JSON string on each entity for flexible querying and rendering.
// ---------------------------------------------------------------------------

export const customFieldEntityEnum = pgEnum("custom_field_entity", [
  "property",
  "lease",
  "tenant",
]);

export const customFieldTypeEnum = pgEnum("custom_field_type", [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "checkbox",
  "email",
  "phone",
]);

export const customFieldDefinitions = pgTable(
  "custom_field_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** The portfolio these fields belong to — every member sees them. */
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "restrict" }),
    entity: customFieldEntityEnum("entity").notNull(),
    /** Stable key used as the JSON key for values. */
    key: varchar("key", { length: 64 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    type: customFieldTypeEnum("type").default("text").notNull(),
    required: boolean("required").default(false).notNull(),
    /** Comma-separated options for select fields. */
    options: text("options"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("custom_field_definitions_portfolio_entity_key").on(
      t.portfolioId,
      t.entity,
      t.key,
    ),
    index("custom_field_definitions_portfolio_id_idx").on(t.portfolioId),
  ],
);

export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;
export type NewCustomFieldDefinition = typeof customFieldDefinitions.$inferInsert;

// ---------------------------------------------------------------------------
// Feature requests — what landlords ask for. Submissions are private to the
// person who wrote them and the owner; only requests the owner promotes with
// `isPublic` appear on the public roadmap, and never with an identity
// attached. `portfolioId` and `planAtSubmission` are the triage signal: how
// much rent this ask might touch, and who is asking for it.
// ---------------------------------------------------------------------------

export const featureRequestCategoryEnum = pgEnum("feature_request_category", [
  "properties",
  "leases",
  "tenants",
  "rent_collection",
  "maintenance",
  "reports",
  "tenant_portal",
  "integrations",
  "other",
]);

export const featureRequestStatusEnum = pgEnum("feature_request_status", [
  "submitted",
  "under_review",
  "planned",
  "shipped",
  "declined",
]);

// ---------------------------------------------------------------------------
// Contact messages — anonymous "get in touch" submissions from the public site.
//
// Deliberately a separate table from `feature_requests`: those are tied to a
// signed-in landlord (author, portfolio, plan), and contact messages come from
// prospects and tenants who have no account. Mixing them would force a nullable
// author onto a model that assumes one everywhere.
// ---------------------------------------------------------------------------
export const contactMessages = pgTable(
  "contact_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 150 }).notNull(),
    message: text("message").notNull(),
    status: varchar("status", { length: 20 }).default("open").notNull(),
    repliedAt: timestamp("replied_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("contact_messages_created_at_idx").on(t.createdAt)],
);
export const featureRequests = pgTable(
  "feature_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** The landlord who wrote it. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The portfolio they were in when they asked — sizes the ask. */
    portfolioId: uuid("portfolio_id").references(() => portfolios.id, {
      onDelete: "set null",
    }),
    category: featureRequestCategoryEnum("category").default("other").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    details: text("details").notNull(),
    status: featureRequestStatusEnum("status").default("submitted").notNull(),
    /** Snapshot, not a live join: the plan when they asked is the signal. */
    planAtSubmission: varchar("plan_at_submission", { length: 32 }),
    /** Curated by the owner to appear on the public roadmap. */
    isPublic: boolean("is_public").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("feature_requests_user_id_idx").on(t.userId),
    index("feature_requests_status_idx").on(t.status),
    index("feature_requests_public_idx").on(t.isPublic),
  ],
);

/**
 * Status history. Each row is something the submitter is told about, so the
 * note is public-facing — there is no separate internal note by design.
 */
export const featureRequestUpdates = pgTable(
  "feature_request_updates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => featureRequests.id, { onDelete: "cascade" }),
    status: featureRequestStatusEnum("status").notNull(),
    note: text("note"),
    /** Null for the automatic "submitted" entry. */
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("feature_request_updates_request_id_idx").on(t.requestId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message"),
    link: varchar("link", { length: 1000 }),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("notifications_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Bank accounts — landlord bank details shown to tenants for bank transfers.
// Each landlord can add multiple accounts; tenants see active ones when
// choosing bank transfer as payment method.
// ---------------------------------------------------------------------------

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bankCode: varchar("bank_code", { length: 50 }).notNull(),
    bankName: varchar("bank_name", { length: 255 }).notNull(),
    accountNumber: varchar("account_number", { length: 50 }).notNull(),
    accountName: varchar("account_name", { length: 255 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("bank_accounts_user_id_idx").on(t.userId),
  ],
);

export type BankAccount = typeof bankAccounts.$inferSelect;
export type NewBankAccount = typeof bankAccounts.$inferInsert;

// ---------------------------------------------------------------------------
// Gamification — XP ledger (append-only) and one-time achievement unlocks.
// XP is awarded by server actions for landlord-positive behavior; badges are
// derived from portfolio data on the fly and recorded here the first time
// they're earned so the celebration only fires once.
// ---------------------------------------------------------------------------

export const xpEvents = pgTable(
  "xp_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Award kind, e.g. "property_created" — see XP_REWARDS. */
    type: varchar("type", { length: 64 }).notNull(),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("xp_events_user_id_idx").on(t.userId)],
);

export const achievements = pgTable(
  "achievements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Badge key — see BADGES in src/lib/gamification.ts. */
    key: varchar("key", { length: 64 }).notNull(),
    unlockedAt: timestamp("unlocked_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("achievements_user_key").on(t.userId, t.key),
    index("achievements_user_id_idx").on(t.userId),
  ],
);
