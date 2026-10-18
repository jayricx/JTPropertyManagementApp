import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { customFieldDefinitions } from "@/db/schema";

/**
 * Custom fields — owner-defined extras on properties, leases and tenants.
 *
 * Definitions belong to the *portfolio*, so every member (owner and co-owner
 * alike) works with exactly the same fields; only the owner may add, rename or
 * remove a definition. Values live in a JSON string column on each entity, so
 * adding a field never needs a schema change.
 */

export type CustomFieldEntity = "property" | "lease" | "tenant";

export type CustomFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "checkbox"
  | "email"
  | "phone";

export interface CustomFieldDefinition {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  options: string[];
  sortOrder: number;
}

export const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Choice" },
  { value: "checkbox", label: "Yes / No" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

/** Form field prefix, so a custom field can never collide with a real input. */
const FIELD_PREFIX = "cf:";

export function customFieldInputName(key: string): string {
  return `${FIELD_PREFIX}${key}`;
}

/** Read a JSON blob defensively — a bad value must never break the page. */
export function parseCustomFields(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [
        k,
        typeof v === "string" ? v : String(v),
      ]),
    );
  } catch {
    return {};
  }
}

export function serializeCustomFields(
  values: Record<string, string>,
): string {
  // Drop empties so the blob stays small, but keep "false" (a real answer).
  const clean = Object.fromEntries(
    Object.entries(values).filter(
      ([, v]) => v !== "" && v !== null && v !== undefined,
    ),
  );
  return JSON.stringify(clean);
}

/** The portfolio's definitions for one entity, in display order. */
export async function definitionsFor(
  portfolioId: string,
  entity: CustomFieldEntity,
): Promise<CustomFieldDefinition[]> {
  const rows = await db
    .select()
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.portfolioId, portfolioId),
        eq(customFieldDefinitions.entity, entity),
      ),
    )
    .orderBy(asc(customFieldDefinitions.sortOrder), asc(customFieldDefinitions.label));

  return rows.map((row) => ({
    id: row.id,
    entity: row.entity,
    key: row.key,
    label: row.label,
    type: row.type,
    required: row.required,
    options: row.options
      ? row.options.split(",").map((o) => o.trim()).filter(Boolean)
      : [],
    sortOrder: row.sortOrder,
  }));
}

/**
 * Validate submitted values against the definitions. Unknown keys are dropped
 * and known ones are checked, so a crafted form can't inject extra keys and a
 * bad email can't be stored just because the input said so.
 */
export function validateCustomFieldValues(
  definitions: CustomFieldDefinition[],
  submitted: Record<string, string>,
): { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  const values: Record<string, string> = {};

  for (const def of definitions) {
    const raw = (submitted[`${FIELD_PREFIX}${def.key}`] ?? "").trim();

    if (!raw) {
      if (def.required && def.type !== "checkbox") {
        return { ok: false, error: `${def.label} is required.` };
      }
      if (def.type === "checkbox") values[def.key] = "false";
      continue;
    }

    switch (def.type) {
      case "number": {
        if (!Number.isFinite(Number(raw))) {
          return { ok: false, error: `${def.label} must be a number.` };
        }
        values[def.key] = raw;
        break;
      }
      case "date": {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          return { ok: false, error: `${def.label} must be a date.` };
        }
        values[def.key] = raw;
        break;
      }
      case "checkbox": {
        values[def.key] = raw === "true" || raw === "on" ? "true" : "false";
        break;
      }
      case "email": {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
          return { ok: false, error: `${def.label} must be an email address.` };
        }
        values[def.key] = raw;
        break;
      }
      case "select": {
        if (!def.options.includes(raw)) {
          return { ok: false, error: `${def.label} isn't one of the choices.` };
        }
        values[def.key] = raw;
        break;
      }
      default:
        values[def.key] = raw.slice(0, 2000);
    }
  }

  return { ok: true, values };
}

/** Pull the `cf:`-prefixed entries out of a form submission. */
export function collectCustomFieldInputs(
  formData: FormData,
): Record<string, string> {
  const out: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (key.startsWith(FIELD_PREFIX) && typeof value === "string") {
      out[key] = value;
    }
  });
  return out;
}