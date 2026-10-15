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

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: varchar("image", { length: 255 }),
  // App-specific columns (ignored by the Auth.js adapter)
  passwordHash: varchar("password_hash", { length: 255 }),
  // Landlords run the dashboard; tenant accounts only ever see the portal.
  role: userRoleEnum("role").default("landlord").notNull(),
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

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Portal login: links this roster entry to a tenant-role user account.
    // Deleting the account keeps the roster row (set null). One account per
    // tenant is enforced by the grant action, which creates a fresh user.
    accountId: uuid("account_id").references(() => users.id, {
      onDelete: "set null",
    }),
    firstName: varchar("first_name", { length: 255 }).notNull(),
    lastName: varchar("last_name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    notes: text("notes"),
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

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "check",
  "bank_transfer",
  "card",
  "gcash",
  "other",
]);

export const paymentTypeEnum = pgEnum("payment_type", [
  "rent",
  "deposit",
  "late_fee",
  "other",
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
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("payments_user_id_idx").on(t.userId),
    index("payments_lease_id_idx").on(t.leaseId),
  ],
);

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
    name: varchar("name", { length: 255 }).notNull(),
    url: varchar("url", { length: 1000 }).notNull(),
    type: varchar("type", { length: 100 }),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("documents_user_id_idx").on(t.userId)],
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
