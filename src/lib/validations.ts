import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must be at most 100 characters"),
});
export type RegisterFormValues = z.infer<typeof registerSchema>;

// ---------------------------------------------------------------------------
// Properties & units
// ---------------------------------------------------------------------------

export const propertyTypes = [
  "apartment",
  "house",
  "condo",
  "townhouse",
  "duplex",
  "commercial",
  "other",
] as const;
export type PropertyType = (typeof propertyTypes)[number];

export const propertyTypeLabels: Record<PropertyType, string> = {
  apartment: "Apartment",
  house: "House",
  condo: "Condo",
  townhouse: "Townhouse",
  duplex: "Duplex",
  commercial: "Commercial",
  other: "Other",
};

export const unitStatuses = ["vacant", "occupied", "maintenance"] as const;
export type UnitStatus = (typeof unitStatuses)[number];

export const unitStatusLabels: Record<UnitStatus, string> = {
  vacant: "Vacant",
  occupied: "Occupied",
  maintenance: "Maintenance",
};

// Empty form fields arrive as "" — normalize them to undefined so optional
// columns store NULL instead of empty strings. The union keeps the zod
// *input* type form-friendly ("" | value | undefined) for react-hook-form.
const optionalText = (max: number) =>
  z
    .union([
      z.literal(""),
      z.string().trim().max(max, `Must be at most ${max} characters`),
    ])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v));

const optionalNumber = (min: number, max: number) =>
  z
    .union([
      z.literal(""),
      z
        .number()
        .min(min, `Must be at least ${min}`)
        .max(max, `Must be at most ${max}`),
      z
        .string()
        .trim()
        .regex(/^-?(\d+(\.\d+)?|\.\d+)$/, "Must be a number")
        .transform(Number)
        .pipe(
          z.number().min(min, `Must be at least ${min}`).max(max, `Must be at most ${max}`),
        ),
    ])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v));

export const propertySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(255, "Name must be at most 255 characters"),
  address: optionalText(500),
  city: optionalText(255),
  state: optionalText(100),
  zipCode: optionalText(20),
  country: optionalText(100),
  type: z.enum(propertyTypes),
  notes: optionalText(5000),
});
export type PropertyFormValues = z.input<typeof propertySchema>;
export type PropertyFormParsed = z.output<typeof propertySchema>;

export const unitSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Unit name is required")
    .max(100, "Unit name must be at most 100 characters"),
  bedrooms: optionalNumber(0, 50),
  bathrooms: optionalNumber(0, 50),
  rentAmount: optionalNumber(0, 1_000_000),
  sqft: optionalNumber(0, 10_000_000),
  status: z.enum(unitStatuses),
  notes: optionalText(5000),
});
export type UnitFormValues = z.input<typeof unitSchema>;
export type UnitFormParsed = z.output<typeof unitSchema>;

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

export const tenantSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(255, "First name must be at most 255 characters"),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required")
    .max(255, "Last name must be at most 255 characters"),
  email: z
    .union([
      z.literal(""),
      z.string().trim().email("Please enter a valid email address"),
    ])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  phone: optionalText(50),
  notes: optionalText(5000),
});
export type TenantFormValues = z.input<typeof tenantSchema>;
export type TenantFormParsed = z.output<typeof tenantSchema>;

// ---------------------------------------------------------------------------
// Leases
// ---------------------------------------------------------------------------

export const leaseStatuses = ["upcoming", "active", "ended"] as const;
export type LeaseStatus = (typeof leaseStatuses)[number];

export const leaseStatusLabels: Record<LeaseStatus, string> = {
  upcoming: "Upcoming",
  active: "Active",
  ended: "Ended",
};

/** Matches an ISO date string as produced by `<input type="date">`. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid date");

export const leaseSchema = z
  .object({
    unitId: z.uuid("Please select a unit"),
    tenantId: z.uuid("Please select a tenant"),
    startDate: isoDate,
    endDate: z.union([z.literal(""), isoDate]).optional(),
    rentAmount: optionalNumber(0, 1_000_000),
    depositAmount: optionalNumber(0, 1_000_000),
    // Native checkbox — "on" when checked, absent when unchecked.
    depositReturned: z.union([z.literal("on"), z.literal("")]).optional(),
    status: z.enum(leaseStatuses),
    notes: optionalText(5000),
  })
  .refine((v) => v.rentAmount !== undefined, {
    message: "Monthly rent is required",
    path: ["rentAmount"],
  })
  // ISO date strings compare correctly in lexicographic order.
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });
export type LeaseFormValues = z.input<typeof leaseSchema>;
export type LeaseFormParsed = z.output<typeof leaseSchema>;

// ---------------------------------------------------------------------------
// Payments & expenses
// ---------------------------------------------------------------------------

/** Optional UUID form field — "" becomes undefined (NULL) in the database. */
const optionalUuid = (message: string) =>
  z
    .union([z.literal(""), z.uuid(message)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v));

/** Mirrors `signature_role` in the schema. */
export const signatureRoles = ["landlord", "tenant"] as const;
export type SignatureRole = (typeof signatureRoles)[number];

/** Mirrors `signature_method` in the schema. */
export const signatureMethods = ["typed", "drawn"] as const;
export type SignatureMethod = (typeof signatureMethods)[number];

/**
 * Lease signature form. Typed signatures store the name; drawn ones a PNG
 * data URL, capped so a signature can never bloat a row. The attestation
 * checkbox is checked in the action (it posts as "on").
 */
export const leaseSignatureSchema = z.object({
  signerName: z
    .string()
    .trim()
    .min(2, "Enter the signer's full name.")
    .max(255, "That name is too long."),
  method: z.enum(signatureMethods),
  drawnSignature: z
    .string()
    .max(400_000, "That signature image is too large — draw a smaller one.")
    .optional(),
});

export const paymentMethods = [
  "cash",
  "check",
  "bank_transfer",
  "card",
  "gcash",
  "other",
] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Cash",
  check: "Check",
  bank_transfer: "Bank transfer",
  card: "Card",
  gcash: "GCash",
  other: "Other",
};

export const paymentTypes = ["rent", "deposit", "late_fee", "other"] as const;
export type PaymentType = (typeof paymentTypes)[number];

export const paymentTypeLabels: Record<PaymentType, string> = {
  rent: "Rent",
  deposit: "Deposit",
  late_fee: "Late fee",
  other: "Other",
};

export const paymentSchema = z
  .object({
    leaseId: optionalUuid("Please select a lease"),
    amount: optionalNumber(0, 1_000_000),
    paidDate: isoDate,
    method: z.enum(paymentMethods),
    type: z.enum(paymentTypes),
    notes: optionalText(5000),
  })
  .refine((v) => v.amount !== undefined, {
    message: "Amount is required",
    path: ["amount"],
  });
export type PaymentFormValues = z.input<typeof paymentSchema>;
export type PaymentFormParsed = z.output<typeof paymentSchema>;

/**
 * The "Add payment" dialog supports two modes:
 * - `single` — one record on the chosen date (lease optional);
 * - `range` — backfill: one record per month between `startMonth` and
 *   `endMonth`, each stamped on `day` of that month (clamped to the month's
 *   length) and tied to a lease. Range fields are only checked in range mode;
 *   `paidDate` stays required because the dialog prefills it even when the
 *   date input is hidden.
 */
export const paymentCreateSchema = z
  .object({
    mode: z.enum(["single", "range"]),
    leaseId: optionalUuid("Please select a lease"),
    amount: optionalNumber(0, 1_000_000),
    paidDate: isoDate,
    startMonth: z.string(),
    endMonth: z.string(),
    day: z.string(),
    method: z.enum(paymentMethods),
    type: z.enum(paymentTypes),
    notes: optionalText(5000),
  })
  .refine((v) => v.amount !== undefined, {
    message: "Amount is required",
    path: ["amount"],
  })
  .superRefine((v, ctx) => {
    if (v.mode !== "range") return;

    if (!v.leaseId) {
      ctx.addIssue({
        code: "custom",
        path: ["leaseId"],
        message: "Please select a lease",
      });
    }

    const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;
    const startOk = monthRe.test(v.startMonth);
    const endOk = monthRe.test(v.endMonth);
    if (!startOk) {
      ctx.addIssue({
        code: "custom",
        path: ["startMonth"],
        message: "Pick a month",
      });
    }
    if (!endOk) {
      ctx.addIssue({
        code: "custom",
        path: ["endMonth"],
        message: "Pick a month",
      });
    }
    if (startOk && endOk) {
      // "YYYY-MM" compares correctly in lexicographic order.
      if (v.endMonth < v.startMonth) {
        ctx.addIssue({
          code: "custom",
          path: ["endMonth"],
          message: "Must be on or after the start month",
        });
      } else {
        const [sy, sm] = v.startMonth.split("-").map(Number);
        const [ey, em] = v.endMonth.split("-").map(Number);
        const months = (ey - sy) * 12 + (em - sm) + 1;
        if (months > 36) {
          ctx.addIssue({
            code: "custom",
            path: ["endMonth"],
            message: "You can add up to 36 months at a time",
          });
        }
      }
    }

    if (!/^\d{1,2}$/.test(v.day) || Number(v.day) < 1 || Number(v.day) > 31) {
      ctx.addIssue({
        code: "custom",
        path: ["day"],
        message: "Day must be between 1 and 31",
      });
    }
  });
export type PaymentCreateFormValues = z.input<typeof paymentCreateSchema>;
export type PaymentCreateFormParsed = z.output<typeof paymentCreateSchema>;

export const expenseCategories = [
  "repair",
  "maintenance",
  "tax",
  "insurance",
  "utilities",
  "hoa",
  "supplies",
  "other",
] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  repair: "Repair",
  maintenance: "Maintenance",
  tax: "Tax",
  insurance: "Insurance",
  utilities: "Utilities",
  hoa: "HOA",
  supplies: "Supplies",
  other: "Other",
};

export const expenseSchema = z
  .object({
    propertyId: z.uuid("Please select a property"),
    unitId: optionalUuid("Please select a unit"),
    category: z.enum(expenseCategories),
    amount: optionalNumber(0, 1_000_000),
    expenseDate: isoDate,
    vendor: optionalText(255),
    notes: optionalText(5000),
  })
  .refine((v) => v.amount !== undefined, {
    message: "Amount is required",
    path: ["amount"],
  });
export type ExpenseFormValues = z.input<typeof expenseSchema>;
export type ExpenseFormParsed = z.output<typeof expenseSchema>;

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export const maintenanceStatuses = [
  "new",
  "in_progress",
  "resolved",
  "cancelled",
] as const;
export type MaintenanceStatus = (typeof maintenanceStatuses)[number];

export const maintenanceStatusLabels: Record<MaintenanceStatus, string> = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

export const maintenancePriorities = [
  "low",
  "medium",
  "high",
  "urgent",
] as const;
export type MaintenancePriority = (typeof maintenancePriorities)[number];

export const maintenancePriorityLabels: Record<MaintenancePriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const maintenanceSchema = z.object({
  propertyId: z.uuid("Please select a property"),
  unitId: z.uuid("Please select a unit"),
  tenantId: optionalUuid("Please select a tenant"),
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(255, "Title must be at most 255 characters"),
  description: optionalText(5000),
  status: z.enum(maintenanceStatuses),
  priority: z.enum(maintenancePriorities),
  cost: optionalNumber(0, 1_000_000),
});
export type MaintenanceFormValues = z.input<typeof maintenanceSchema>;
export type MaintenanceFormParsed = z.output<typeof maintenanceSchema>;

/**
 * Tenant portal: report an issue. Property/unit/tenant are derived from the
 * tenant's own active lease server-side — never trusted from the client.
 */
export const tenantRequestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(255, "Title must be at most 255 characters"),
  description: optionalText(5000),
  priority: z.enum(maintenancePriorities),
});
export type TenantRequestFormValues = z.input<typeof tenantRequestSchema>;
