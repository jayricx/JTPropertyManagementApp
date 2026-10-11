"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { expenses, leases, payments, properties, units } from "@/db/schema";
import {
  expenseSchema,
  paymentSchema,
  type ExpenseFormParsed,
  type PaymentFormParsed,
} from "@/lib/validations";

/** `ok` lets dialog forms close themselves after a successful mutation. */
export type ActionState = { error?: string; ok?: boolean } | null;

function toFormDataRecord(formData: FormData): Record<string, string> {
  const record: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") record[key] = value;
  });
  return record;
}

/** Parse an ISO date string as a UTC midnight so the calendar day sticks. */
function toUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function revalidateFinancePaths() {
  // The dashboard's "Income this month" KPI reads from payments.
  revalidatePath("/finance");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/** A payment may reference a lease — confirm it belongs to this user. */
async function ownsLease(userId: string, leaseId: string) {
  const rows = await db
    .select({ id: leases.id })
    .from(leases)
    .innerJoin(units, eq(leases.unitId, units.id))
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(and(eq(leases.id, leaseId), eq(properties.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

function paymentDbValues(data: PaymentFormParsed) {
  return {
    leaseId: data.leaseId,
    amount: String(data.amount ?? 0),
    paidDate: toUtcDate(data.paidDate),
    method: data.method,
    type: data.type,
    notes: data.notes,
  };
}

export async function createPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const parsed = paymentSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payment data." };
  }

  if (parsed.data.leaseId && !(await ownsLease(session.user.id, parsed.data.leaseId))) {
    return { error: "Lease not found." };
  }

  await db
    .insert(payments)
    .values({ ...paymentDbValues(parsed.data), userId: session.user.id });

  revalidateFinancePaths();
  return { ok: true };
}

export async function updatePaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const paymentId = formData.get("paymentId");
  if (typeof paymentId !== "string" || !paymentId) {
    return { error: "Missing payment id." };
  }

  const parsed = paymentSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payment data." };
  }

  if (parsed.data.leaseId && !(await ownsLease(session.user.id, parsed.data.leaseId))) {
    return { error: "Lease not found." };
  }

  const updated = await db
    .update(payments)
    .set(paymentDbValues(parsed.data))
    .where(and(eq(payments.id, paymentId), eq(payments.userId, session.user.id)))
    .returning({ id: payments.id });
  if (!updated.length) return { error: "Payment not found." };

  revalidateFinancePaths();
  return { ok: true };
}

export async function deletePaymentAction(
  paymentId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const deleted = await db
    .delete(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.userId, session.user.id)))
    .returning({ id: payments.id });
  if (!deleted.length) return { error: "Payment not found." };

  revalidateFinancePaths();
  return {};
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

/** Confirm the property (and, if given, the unit within it) is this user's. */
async function ownsExpenseTargets(
  userId: string,
  propertyId: string,
  unitId?: string,
) {
  const propertyRows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)))
    .limit(1);
  if (!propertyRows.length) return false;
  if (!unitId) return true;

  const unitRows = await db
    .select({ id: units.id })
    .from(units)
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(
      and(
        eq(units.id, unitId),
        eq(units.propertyId, propertyId),
        eq(properties.userId, userId),
      ),
    )
    .limit(1);
  return unitRows.length > 0;
}

function expenseDbValues(data: ExpenseFormParsed) {
  return {
    propertyId: data.propertyId,
    unitId: data.unitId,
    category: data.category,
    amount: String(data.amount ?? 0),
    expenseDate: toUtcDate(data.expenseDate),
    vendor: data.vendor,
    notes: data.notes,
  };
}

export async function createExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const parsed = expenseSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid expense data." };
  }

  if (
    !(await ownsExpenseTargets(
      session.user.id,
      parsed.data.propertyId,
      parsed.data.unitId,
    ))
  ) {
    return { error: "Property or unit not found." };
  }

  await db
    .insert(expenses)
    .values({ ...expenseDbValues(parsed.data), userId: session.user.id });

  revalidateFinancePaths();
  return { ok: true };
}

export async function updateExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const expenseId = formData.get("expenseId");
  if (typeof expenseId !== "string" || !expenseId) {
    return { error: "Missing expense id." };
  }

  const parsed = expenseSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid expense data." };
  }

  if (
    !(await ownsExpenseTargets(
      session.user.id,
      parsed.data.propertyId,
      parsed.data.unitId,
    ))
  ) {
    return { error: "Property or unit not found." };
  }

  const updated = await db
    .update(expenses)
    .set(expenseDbValues(parsed.data))
    .where(and(eq(expenses.id, expenseId), eq(expenses.userId, session.user.id)))
    .returning({ id: expenses.id });
  if (!updated.length) return { error: "Expense not found." };

  revalidateFinancePaths();
  return { ok: true };
}

export async function deleteExpenseAction(
  expenseId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const deleted = await db
    .delete(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.userId, session.user.id)))
    .returning({ id: expenses.id });
  if (!deleted.length) return { error: "Expense not found." };

  revalidateFinancePaths();
  return {};
}
