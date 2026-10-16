"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, maintenanceRequests, tenantInvitations, tenants, users } from "@/db/schema";
import { tenantSchema } from "@/lib/validations";
import { emailDiagnostics, sendPortalInviteEmail } from "@/lib/email";
import {
  createTenantInvitation,
  INVITE_TTL_HOURS,
} from "@/lib/tenant-invitations";
import { awardXp } from "@/lib/gamification";
import { syncUnitStatus } from "../leases/actions";

export type ActionState = { error: string } | null;

function appUrl(): string {
  // AUTH_URL is the deployment's canonical origin.
  return (
    process.env.AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function toFormDataRecord(formData: FormData): Record<string, string> {
  const record: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") record[key] = value;
  });
  return record;
}

function revalidateTenantPaths() {
  revalidatePath("/tenants");
  revalidatePath("/leases");
}

export async function createTenantAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const parsed = tenantSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid tenant data." };
  }

  await db
    .insert(tenants)
    .values({ ...parsed.data, userId: session.user.id });

  await awardXp(session.user.id, "tenant_created");
  revalidateTenantPaths();
  redirect("/tenants");
}

export async function updateTenantAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const tenantId = formData.get("tenantId");
  if (typeof tenantId !== "string" || !tenantId) {
    return { error: "Missing tenant id." };
  }

  const parsed = tenantSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid tenant data." };
  }

  const updated = await db
    .update(tenants)
    .set(parsed.data)
    .where(and(eq(tenants.id, tenantId), eq(tenants.userId, session.user.id)))
    .returning({ id: tenants.id });
  if (!updated.length) return { error: "Tenant not found." };

  revalidateTenantPaths();
  redirect("/tenants");
}

export async function deleteTenantAction(
  tenantId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const owned = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.userId, session.user.id)))
    .limit(1);
  if (!owned.length) return { error: "Tenant not found." };

  // Leases reference tenants with onDelete: "cascade", so collect the units
  // they occupy first — those need their status resynced after the delete.
  const leaseUnits = await db
    .select({ unitId: leases.unitId })
    .from(leases)
    .where(eq(leases.tenantId, tenantId));

  await db.delete(tenants).where(eq(tenants.id, tenantId));

  for (const { unitId } of leaseUnits) {
    await syncUnitStatus(unitId);
  }

  revalidateTenantPaths();
  revalidatePath("/properties");
  return {};
}

// ---------------------------------------------------------------------------
// Tenant portal access — the landlord emails an invite (or revokes one) for a
// roster entry; the tenant's account is only created when they complete that
// link at /api/auth/complete-portal-setup, with role "tenant", so it can never
// see the dashboard (the layout bounces it).
// ---------------------------------------------------------------------------

export async function sendPortalInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const tenantId = formData.get("tenantId");
  if (typeof tenantId !== "string" || !tenantId) {
    return { error: "Missing tenant id." };
  }

  // Roster entries are per-landlord — only the creator may grant access.
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.userId, session.user.id)))
    .limit(1);
  if (!tenant) return { error: "Tenant not found." };
  if (tenant.accountId) {
    return { error: "Portal access is already granted for this tenant." };
  }

  const email = tenant.email?.trim().toLowerCase();
  if (!email) {
    return { error: "Add an email address to the tenant first." };
  }

  const clash = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);
  if (clash.length) {
    return { error: "An account with that email already exists." };
  }

  const started = await createTenantInvitation(tenant.id);
  if (!started.ok) {
    return {
      error: `An invite was just emailed to ${email}. Try again in a few minutes.`,
    };
  }

  const send = await sendPortalInviteEmail({
    to: email,
    tenantName: `${tenant.firstName} ${tenant.lastName}`.trim(),
    landlordName: session.user.name ?? "Your landlord",
    setupUrl: `${appUrl()}/portal-setup?token=${encodeURIComponent(started.token)}`,
    expiresInHours: INVITE_TTL_HOURS,
  });

  // No API key means the invite was logged to the dev console instead — that is
  // the local test path, not a failure. When a key is set, a rejected send must
  // reach the landlord: otherwise the card claims an invite went out while the
  // tenant never received anything (with no verified domain, every send is
  // rejected). Roll the token back too, so "try again" isn't stuck behind the
  // resend cooldown after the config is fixed.
  if (!send.delivered && emailDiagnostics().configured) {
    await db
      .delete(tenantInvitations)
      .where(
        and(
          eq(tenantInvitations.tenantId, tenantId),
          isNull(tenantInvitations.usedAt),
        ),
      );
    return {
      error: `The invite couldn't be emailed to ${email}: ${send.reason ?? "the provider rejected it"}. Check Settings → Email delivery.`,
    };
  }

  await awardXp(session.user.id, "portal_granted");
  revalidateTenantPaths();
  revalidatePath(`/tenants/${tenantId}/edit`);
  return null;
}

export async function revokePortalAccessAction(
  tenantId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const [tenant] = await db
    .select({ id: tenants.id, accountId: tenants.accountId })
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.userId, session.user.id)))
    .limit(1);
  if (!tenant) return { error: "Tenant not found." };

  // Maintenance requests the tenant filed reference their user row and would
  // cascade away with the account — reassign them to the landlord first.
  if (tenant.accountId) {
    await db
      .update(maintenanceRequests)
      .set({ userId: session.user.id })
      .where(eq(maintenanceRequests.userId, tenant.accountId));

    await db.delete(users).where(eq(users.id, tenant.accountId));
    await db
      .update(tenants)
      .set({ accountId: null })
      .where(eq(tenants.id, tenantId));
  }

  // A pending invite is also revoked here, so an emailed link stops working
  // the moment the landlord changes their mind.
  const [revokedInvite] = await db
    .delete(tenantInvitations)
    .where(eq(tenantInvitations.tenantId, tenantId))
    .returning({ id: tenantInvitations.id });

  if (!tenant.accountId && !revokedInvite) {
    return { error: "Portal access is not granted." };
  }

  revalidateTenantPaths();
  revalidatePath(`/tenants/${tenantId}/edit`);
  return {};
}
