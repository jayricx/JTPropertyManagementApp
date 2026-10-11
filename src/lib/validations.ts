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
