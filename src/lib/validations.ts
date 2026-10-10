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
