"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { expenses, payments, units } from "@/db/schema";
import { canAccessLease, canAccessProperty } from "@/lib/access";
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

// Lease access (owned or co-owned property) is checked via `canAccessLease`.

/**
 * A payment may be edited/deleted by its creator, or by a co-owner of the
 * property its lease belongs to. Unassigned payments stay creator-only.
 */
async function canModifyPayment(userId: string, paymentId: string) {
  const rows = await db
    .select({ id: payments.id, userId: payments.userId, leaseId: payments.leaseId })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  if (!rows.length) return false;
  if (rows[0].userId === userId) return true;
  return rows[0].leaseId
    ? canAccessLease(userId, rows[0].leaseId)
    : Promise.resolve(false);
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

  if (
    parsed.data.leaseId &&
    !(await canAccessLease(session.user.id, parsed.data.leaseId))
  ) {
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

  if (
    parsed.data.leaseId &&
    !(await canAccessLease(session.user.id, parsed.data.leaseId))
  ) {
    return { error: "Lease not found." };
  }

  if (!(await canModifyPayment(session.user.id, paymentId))) {
    return { error: "Payment not found." };
  }

  const updated = await db
    .update(payments)
    .set(paymentDbValues(parsed.data))
    .where(eq(payments.id, paymentId))
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

  if (!(await canModifyPayment(session.user.id, paymentId))) {
    return { error: "Payment not found." };
  }

  await db
    .delete(payments)
    .where(eq(payments.id, paymentId))
    .returning({ id: payments.id });

  revalidateFinancePaths();
  return {};
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

/** Confirm the property (and, if given, the unit within it) is accessible. */
async function ownsExpenseTargets(
  userId: string,
  propertyId: string,
  unitId?: string,
) {
  if (!(await canAccessProperty(userId, propertyId))) return false;
  if (!unitId) return true;

  // The unit must belong to the same property the expense is booked to.
  const unitRows = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.id, unitId), eq(units.propertyId, propertyId)))
    .limit(1);
  return unitRows.length > 0;
}

/**
 * An expense may be edited/deleted by its creator, or by anyone with access
 * to the property it's booked to (i.e. a co-owner).
 */
async function canModifyExpense(userId: string, expenseId: string) {
  const rows = await db
    .select({
      id: expenses.id,
      userId: expenses.userId,
      propertyId: expenses.propertyId,
    })
    .from(expenses)
    .where(eq(expenses.id, expenseId))
    .limit(1);
  if (!rows.length) return false;
  if (rows[0].userId === userId) return true;
  return rows[0].propertyId
    ? canAccessProperty(userId, rows[0].propertyId)
    : Promise.resolve(false);
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

  if (!(await canModifyExpense(session.user.id, expenseId))) {
    return { error: "Expense not found." };
  }

  const updated = await db
    .update(expenses)
    .set(expenseDbValues(parsed.data))
    .where(eq(expenses.id, expenseId))
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

  if (!(await canModifyExpense(session.user.id, expenseId))) {
    return { error: "Expense not found." };
  }

  await db
    .delete(expenses)
    .where(eq(expenses.id, expenseId))
    .returning({ id: expenses.id });

  revalidateFinancePaths();
  return {};
}
