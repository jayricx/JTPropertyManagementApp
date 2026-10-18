"use server";

import { revalidatePath } from "next/cache";
import { and, asc, count, eq, max } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { customFieldDefinitions, leases, properties, tenants, units } from "@/db/schema";
import {
  collectCustomFieldInputs,
  definitionsFor,
  serializeCustomFields,
  validateCustomFieldValues,
  type CustomFieldEntity,
} from "@/lib/custom-fields";
import { canManagePortfolio, isPortfolioOwner } from "@/lib/portfolios";
import { isUuid } from "@/lib/utils";
import { customFieldDefinitionSchema } from "@/lib/validations";

export type ActionState = { error?: string; ok?: boolean } | null;

const ENTITIES: CustomFieldEntity[] = ["property", "lease", "tenant"];

/** Which table an entity's row lives in. */
function tableFor(entity: CustomFieldEntity) {
  if (entity === "property") return properties;
  if (entity === "lease") return leases;
  return tenants;
}

/**
 * Resolve the portfolio an entity belongs to, from the record itself — never
 * from the form — so a crafted id can't write values onto another portfolio's
 * records or define fields in it. A lease reaches its portfolio through its
 * unit's property.
 */
async function portfolioForEntity(
  entity: CustomFieldEntity,
  targetId: string,
): Promise<string | null> {
  if (entity === "property") {
    const [row] = await db
      .select({ portfolioId: properties.portfolioId })
      .from(properties)
      .where(eq(properties.id, targetId))
      .limit(1);
    return row?.portfolioId ?? null;
  }
  if (entity === "lease") {
    const [row] = await db
      .select({ portfolioId: properties.portfolioId })
      .from(leases)
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(eq(leases.id, targetId))
      .limit(1);
    return row?.portfolioId ?? null;
  }
  const [row] = await db
    .select({ portfolioId: tenants.portfolioId })
    .from(tenants)
    .where(eq(tenants.id, targetId))
    .limit(1);
  return row?.portfolioId ?? null;
}

/** The caller may be an owner or co-owner (values), never a viewer. */
async function memberOfPortfolio(
  userId: string,
  portfolioId: string,
): Promise<boolean> {
  return canManagePortfolio(userId, portfolioId);
}

function revalidateEntity(entity: CustomFieldEntity, targetId: string): void {
  if (entity === "property") revalidatePath(`/properties/${targetId}`);
  if (entity === "lease") revalidatePath("/leases");
  if (entity === "tenant") revalidatePath("/tenants");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Definitions — owner only
// ---------------------------------------------------------------------------

/**
 * Add a custom field to the portfolio for one entity. The key is the stable
 * storage key and is immutable afterwards; renaming only changes the label, so
 * saved values survive.
 */
export async function createCustomFieldDefinitionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const entity = String(formData.get("entity") ?? "") as CustomFieldEntity;
  if (!ENTITIES.includes(entity)) return { error: "Unknown field type." };

  const parsed = customFieldDefinitionSchema.safeParse({
    label: formData.get("label") ?? "",
    key: formData.get("key") ?? "",
    type: formData.get("type") ?? "text",
    required: formData.get("required") === "on",
    options: formData.get("options") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid field." };
  }

  // The portfolio comes from a real record of the right kind, so definitions
  // can't be created in a portfolio the caller isn't the owner of.
  const anchorId = String(formData.get("anchorId") ?? "");
  if (!isUuid(anchorId)) return { error: "Save the field from a record." };
  const portfolioId = await portfolioForEntity(entity, anchorId);
  if (!portfolioId) return { error: "That record no longer exists." };

  if (!(await isPortfolioOwner(session.user.id, portfolioId))) {
    return { error: "Only the portfolio owner can add fields." };
  }

  const existing = await db
    .select({ id: customFieldDefinitions.id })
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.portfolioId, portfolioId),
        eq(customFieldDefinitions.entity, entity),
        eq(customFieldDefinitions.key, parsed.data.key),
      ),
    )
    .limit(1);
  if (existing) {
    return { error: `A field with the key "${parsed.data.key}" already exists.` };
  }

  const [order] = await db
    .select({ n: max(customFieldDefinitions.sortOrder) })
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.portfolioId, portfolioId),
        eq(customFieldDefinitions.entity, entity),
      ),
    );

  await db.insert(customFieldDefinitions).values({
    portfolioId,
    entity,
    key: parsed.data.key,
    label: parsed.data.label,
    type: parsed.data.type,
    required: parsed.data.required ?? false,
    options: parsed.data.options ?? null,
    sortOrder: Number(order?.n ?? 0) + 1,
  });

  revalidateEntity(entity, anchorId);
  return { ok: true };
}

/**
 * Rename a field, change its type/choices, or reorder it. The key is never
 * touched, so every stored value keeps pointing at the same data.
 */
export async function updateCustomFieldDefinitionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const id = String(formData.get("definitionId") ?? "");
  if (!isUuid(id)) return { error: "Field not found." };

  const [def] = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.id, id))
    .limit(1);
  if (!def) return { error: "Field not found." };
  if (!(await isPortfolioOwner(session.user.id, def.portfolioId))) {
    return { error: "Only the portfolio owner can change fields." };
  }

  const label = String(formData.get("label") ?? "").trim();
  if (label.length < 1) return { error: "Label is required." };

  await db
    .update(customFieldDefinitions)
    .set({
      label,
      required: formData.get("required") === "on",
      options: String(formData.get("options") ?? "").trim() || null,
    })
    .where(eq(customFieldDefinitions.id, id));

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Delete a definition. Stored values are left in place (hidden), so re-adding
 * a field with the same key restores whatever was typed — better than silently
 * destroying an owner's data.
 */
export async function deleteCustomFieldDefinitionAction(
  definitionId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  if (!isUuid(definitionId)) return { error: "Field not found." };

  const [def] = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.id, definitionId))
    .limit(1);
  if (!def) return { error: "Field not found." };
  if (!(await isPortfolioOwner(session.user.id, def.portfolioId))) {
    return { error: "Only the portfolio owner can remove fields." };
  }

  await db
    .delete(customFieldDefinitions)
    .where(eq(customFieldDefinitions.id, definitionId));

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return {};
}

/** Move a field up or down within its entity. */
export async function moveCustomFieldDefinitionAction(
  definitionId: string,
  direction: "up" | "down",
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  if (!isUuid(definitionId)) return { error: "Field not found." };

  const [def] = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.id, definitionId))
    .limit(1);
  if (!def) return { error: "Field not found." };
  if (!(await isPortfolioOwner(session.user.id, def.portfolioId))) {
    return { error: "Only the portfolio owner can reorder fields." };
  }

  const siblings = await db
    .select({ id: customFieldDefinitions.id, sortOrder: customFieldDefinitions.sortOrder })
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.portfolioId, def.portfolioId),
        eq(customFieldDefinitions.entity, def.entity),
      ),
    )
    .orderBy(asc(customFieldDefinitions.sortOrder));
  const index = siblings.findIndex((s) => s.id === definitionId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= siblings.length) return {};

  const a = siblings[index];
  const b = siblings[swapWith];
  await db
    .update(customFieldDefinitions)
    .set({ sortOrder: b.sortOrder })
    .where(eq(customFieldDefinitions.id, a.id));
  await db
    .update(customFieldDefinitions)
    .set({ sortOrder: a.sortOrder })
    .where(eq(customFieldDefinitions.id, b.id));

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return {};
}

// ---------------------------------------------------------------------------
// Values — owner and co-owner
// ---------------------------------------------------------------------------

/**
 * Save the custom-field values on one record. Owner or co-owner only; the
 * portfolio comes from the record, and values are validated against the
 * portfolio's definitions before anything is written.
 */
export async function saveCustomFieldValuesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const entity = String(formData.get("entity") ?? "") as CustomFieldEntity;
  if (!ENTITIES.includes(entity)) return { error: "Unknown record type." };

  const targetId = String(formData.get("targetId") ?? "");
  if (!isUuid(targetId)) return { error: "Record not found." };

  const portfolioId = await portfolioForEntity(entity, targetId);
  if (!portfolioId) return { error: "Record not found." };
  if (!(await memberOfPortfolio(session.user.id, portfolioId))) {
    return { error: "You don't have permission to edit this record." };
  }

  const definitions = await definitionsFor(portfolioId, entity);
  const result = validateCustomFieldValues(
    definitions,
    collectCustomFieldInputs(formData),
  );
  if (!result.ok) return { error: result.error };

  const table = tableFor(entity);
  await db
    .update(table)
    .set({ customFields: serializeCustomFields(result.values) })
    .where(eq(table.id, targetId));

  revalidateEntity(entity, targetId);
  return { ok: true };
}

/** Every definition in the portfolio, grouped by entity — for Settings. */
export async function listPortfolioDefinitions(portfolioId: string) {
  const rows = await definitionsFor(portfolioId, "property");
  const [leasesDefs, tenantsDefs, inUse] = await Promise.all([
    definitionsFor(portfolioId, "lease"),
    definitionsFor(portfolioId, "tenant"),
    db
      .select({ n: count() })
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.portfolioId, portfolioId)),
  ]);
  return {
    property: rows,
    lease: leasesDefs,
    tenant: tenantsDefs,
    total: Number(inUse[0]?.n ?? 0),
  };
}