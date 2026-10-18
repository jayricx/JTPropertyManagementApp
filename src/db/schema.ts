import {
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
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Auth.js tables (used by @auth/drizzle-adapter)
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", ["landlord", "tenant"]);
export const planTierEnum = pgEnum("plan_tier", ["free", "pro", "business"]);

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

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
  (t) => [index("properties_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Co-ownership — a property can be shared with other users. Co-owners get
// full manage access; viewers get read-only access (property managers who
// should not change records).
// ---------------------------------------------------------------------------

export const collaboratorRoleEnum = pgEnum("collaborator_role", [
  "co_owner",
  "viewer",
]);

export const propertyCollaborators = pgTable(
  "property_collaborators",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: collaboratorRoleEnum("role").default("co_owner").notNull(),
    addedBy: uuid("added_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("property_collaborators_property_user_key").on(t.propertyId, t.userId),
    index("property_collaborators_user_id_idx").on(t.userId),
  ],
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
    sqft: integer("sqft"),
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
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
  (t) => [index("tenants_user_id_idx").on(t.userId)],
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
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("leases_unit_id_idx").on(t.unitId),
    index("leases_tenant_id_idx").on(t.tenantId),
  ],
);

// ---------------------------------------------------------------------------
// Lease signatures — credential-free e-signing. DocuSign/Hellosign can slot
// in later (provider id + envelope columns); until then a party signs here
// with a typed name or a drawn mark, and the pair is the signed lease.
// One row per party per lease, so re-signing replaces.
// ---------------------------------------------------------------------------

export const signatureRoleEnum = pgEnum("signature_role", [
  "landlord",
  "tenant",
]);

export const signatureMethodEnum = pgEnum("signature_method", [
  "typed",
  "drawn",
]);

export const leaseSignatures = pgTable(
  "lease_signatures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => leases.id, { onDelete: "cascade" }),
    role: signatureRoleEnum("role").notNull(),
    signerName: varchar("signer_name", { length: 255 }).notNull(),
    method: signatureMethodEnum("method").notNull(),
    // Typed: the name as written. Drawn: a PNG data URL of the strokes.
    signature: text("signature").notNull(),
    signedAt: timestamp("signed_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("lease_signatures_lease_role_key").on(t.leaseId, t.role),
    index("lease_signatures_lease_id_idx").on(t.leaseId),
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
    /** Billing month, "YYYY-MM". */
    periodMonth: varchar("period_month", { length: 7 }).notNull(),
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
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("pending_registrations_email_key").on(t.email),
    index("pending_registrations_expires_at_idx").on(t.expiresAt),
  ],
);

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
  ],
);

// ---------------------------------------------------------------------------
// Custom fields — definitions and values per entity (property/lease/tenant).
// Definitions are scoped to the workspace owner (userId). Values are stored
// as JSONB on each entity for flexible querying and rendering.
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
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entity: customFieldEntityEnum("entity").notNull(),
    /** Stable key used as the JSONB key for values. */
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
    unique("custom_field_definitions_user_entity_key").on(
      t.userId,
      t.entity,
      t.key,
    ),
    index("custom_field_definitions_user_id_idx").on(t.userId),
  ],
);

export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;
export type NewCustomFieldDefinition = typeof customFieldDefinitions.$inferInsert;

// Add customFields JSONB columns to entities.
export const customFieldsProperty = {
  customFields: text("custom_fields").default("{}").notNull(),
};
export const customFieldsLease = {
  customFields: text("custom_fields").default("{}").notNull(),
};
export const customFieldsTenant = {
  customFields: text("custom_fields").default("{}").notNull(),
};

// We'll add these as columns below. Let us patch the table definitions next.

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
