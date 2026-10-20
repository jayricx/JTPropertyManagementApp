"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import {
  charges,
  documents,
  leaseContracts,
  leaseNotes,
  leases,
  tenants,
  units,
} from "@/db/schema";
import { canManageLease, canManageUnit } from "@/lib/access";
import { canManagePortfolio } from "@/lib/portfolios";
import {
  sanitizeFileName,
  validateAttachment,
} from "@/lib/attachments";
import { awardXp } from "@/lib/gamification";
import { saveLeaseSignature } from "@/lib/signatures";
import { accountVerification } from "@/lib/signature-verification";
import { isUuid } from "@/lib/utils";
import {
  fromIsoDate,
  isoDate,
  periodIndexForDate,
  periodStartAt,
  resolveDueDay,
  utcDay,
} from "@/lib/billing-periods";
import {
  contractTermsSchema,
  chargeSchema,
  leaseNoteSchema,
  leaseSchema,
  leaseSignatureSchema,
  type LeaseFormParsed,
} from "@/lib/validations";
import {
  activeContract,
  CURRENT_CONTRACT_RENDER_VERSION,
  deliverContract,
  draftTermsFromLease,
  hashContractTerms,
  signContract,
  supersedeOpenContracts,
} from "@/lib/contracts";

export type ActionState = { error: string } | null;

/** Shape for the signature form (landlord + tenant sides share it). */
export type SignatureFormState = { error?: string; ok?: boolean } | null;

/** Shape for the note + attachment forms. */
export type LeaseRecordState = { error?: string; ok?: boolean } | null;

/** Notes and attachments are landlord-only: viewers are read-only. */
async function assertCanManageLease(
  userId: string,
  leaseId: string,
): Promise<string | null> {
  if (!isUuid(leaseId)) return "That lease could not be found.";
  const allowed = await canManageLease(userId, leaseId);
  return allowed ? null : "You do not have permission to change this lease.";
}

export async function addLeaseNoteAction(
  _prev: LeaseRecordState,
  formData: FormData,
): Promise<LeaseRecordState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const leaseId = String(formData.get("leaseId") ?? "");
  const denied = await assertCanManageLease(session.user.id, leaseId);
  if (denied) return { error: denied };

  const parsed = leaseNoteSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid note." };
  }

  await db.insert(leaseNotes).values({
    leaseId,
    userId: session.user.id,
    body: parsed.data.body,
  });

  revalidatePath(`/leases/${leaseId}/edit`);
  return { ok: true };
}

/** Authors can remove their own note; nobody else's. */
export async function deleteLeaseNoteAction(
  _prev: LeaseRecordState,
  formData: FormData,
): Promise<LeaseRecordState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const noteId = String(formData.get("noteId") ?? "");
  if (!isUuid(noteId)) return { error: "That note could not be found." };

  const [note] = await db
    .select({ id: leaseNotes.id, userId: leaseNotes.userId })
    .from(leaseNotes)
    .where(eq(leaseNotes.id, noteId))
    .limit(1);
  if (!note) return { error: "That note could not be found." };
  if (note.userId !== session.user.id) {
    return { error: "You can only delete your own notes." };
  }

  await db.delete(leaseNotes).where(eq(leaseNotes.id, noteId));
  revalidatePath("/leases");
  return { ok: true };
}

export async function uploadLeaseAttachmentAction(
  _prev: LeaseRecordState,
  formData: FormData,
): Promise<LeaseRecordState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const leaseId = String(formData.get("leaseId") ?? "");
  const denied = await assertCanManageLease(session.user.id, leaseId);
  if (denied) return { error: denied };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file to upload." };

  const check = validateAttachment(file);
  if (!check.ok) return { error: check.error };

  // Generate the id here so the canonical url can be stored with the row.
  const id = crypto.randomUUID();
  const bytes = Buffer.from(await file.arrayBuffer());

  await db.insert(documents).values({
    id,
    userId: session.user.id,
    leaseId,
    name: sanitizeFileName(file.name),
    url: `/api/documents/${id}`,
    type: file.type,
    sizeBytes: bytes.byteLength,
    data: bytes.toString("base64"),
  });

  revalidatePath(`/leases/${leaseId}/edit`);
  return { ok: true };
}

export async function deleteLeaseAttachmentAction(
  _prev: LeaseRecordState,
  formData: FormData,
): Promise<LeaseRecordState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const documentId = String(formData.get("documentId") ?? "");
  if (!isUuid(documentId)) return { error: "That file could not be found." };

  const [doc] = await db
    .select({
      id: documents.id,
      leaseId: documents.leaseId,
      userId: documents.userId,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) return { error: "That file could not be found." };
  if (doc.leaseId) {
    const denied = await assertCanManageLease(session.user.id, doc.leaseId);
    if (denied) return { error: denied };
  } else if (doc.userId !== session.user.id) {
    return { error: "You can only delete your own uploads." };
  }

  await db.delete(documents).where(eq(documents.id, documentId));
  revalidatePath("/leases");
  return { ok: true };
}

/**
 * Sign a lease as the landlord. Typed signatures store the name; drawn
 * ones a PNG data URL. The attestation box is required — that is what
 * makes this an electronic signature rather than a scribble.
 */
export async function signLeaseAction(
  _prev: SignatureFormState,
  formData: FormData,
): Promise<SignatureFormState> {
  const session = await auth();
  if (!session?.user || session.user.role !== "landlord") {
    return { error: "Only landlord accounts can sign here." };
  }

  const leaseId = String(formData.get("leaseId") ?? "");
  if (!isUuid(leaseId)) return { error: "That lease could not be found." };

  const [lease] = await db
    .select({ unitId: leases.unitId })
    .from(leases)
    .where(eq(leases.id, leaseId))
    .limit(1);
  if (!lease || !(await canManageUnit(session.user.id, lease.unitId))) {
    return { error: "You cannot sign this lease." };
  }

  const parsed = leaseSignatureSchema.safeParse({
    signerName: formData.get("signerName"),
    method: formData.get("method"),
    drawnSignature: formData.get("drawnSignature") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid signature." };
  }
  if (formData.get("attestation") !== "on") {
    return { error: "Tick the agreement box to sign." };
  }

  const signature =
    parsed.data.method === "typed"
      ? parsed.data.signerName
      : (parsed.data.drawnSignature ?? "");
  if (!signature) return { error: "Draw your signature before signing." };

  await saveLeaseSignature({
    leaseId,
    role: "landlord",
    signerName: parsed.data.signerName,
    method: parsed.data.method,
    signature,
  });

  revalidatePath(`/leases/${leaseId}/edit`);
  revalidatePath(`/leases/${leaseId}/signed`);
  revalidatePath("/leases");
  return { ok: true };
}

function toFormDataRecord(formData: FormData): Record<string, string> {
  const record: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") record[key] = value;
  });
  return record;
}

/**
 * Keep a unit's status in sync with its leases: an active lease means the
 * unit is occupied; without one it goes back to vacant. Units in maintenance
 * are left alone either way — the landlord manages that status manually.
 */
export async function syncUnitStatus(unitId: string): Promise<void> {
  const active = await db
    .select({ id: leases.id })
    .from(leases)
    .where(and(eq(leases.unitId, unitId), eq(leases.status, "active")))
    .limit(1);

  if (active.length) {
    await db
      .update(units)
      .set({ status: "occupied", updatedAt: new Date() })
      .where(
        and(
          eq(units.id, unitId),
          inArray(units.status, ["vacant", "occupied"]),
        ),
      );
  } else {
    await db
      .update(units)
      .set({ status: "vacant", updatedAt: new Date() })
      .where(and(eq(units.id, unitId), eq(units.status, "occupied")));
  }
}

// Unit manage access (owned or co-owned — viewers excluded) is checked via
// `canManageUnit`.

/** The tenant roster is shared by the whole portfolio (owner or co-owner). */
async function ownsTenant(userId: string, tenantId: string) {
  const [row] = await db
    .select({ portfolioId: tenants.portfolioId })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row ? canManagePortfolio(userId, row.portfolioId) : false;
}

/** A unit can only hold one active lease at a time. */
async function hasActiveLease(unitId: string, exceptLeaseId?: string) {
  const rows = await db
    .select({ id: leases.id })
    .from(leases)
    .where(and(eq(leases.unitId, unitId), eq(leases.status, "active")))
    .limit(5);
  return rows.some((r) => r.id !== exceptLeaseId);
}

// Drizzle's numeric columns map to strings by default, so stringify the
// parsed decimal amounts before writing them. Date columns (mode: "date")
// want Date objects — parse the "YYYY-MM-DD" strings as UTC midnights so
// the stored calendar day always matches what the user picked.
function leaseDbValues(data: LeaseFormParsed) {
  return {
    unitId: data.unitId,
    tenantId: data.tenantId,
    startDate: new Date(`${data.startDate}T00:00:00Z`),
    // null (not undefined) so clearing the end date actually persists —
    // Drizzle skips undefined keys in .set()/.values().
    endDate: data.endDate ? new Date(`${data.endDate}T00:00:00Z`) : null,
    rentDueDay: data.rentDueDay ?? null,
    rentAmount: String(data.rentAmount ?? 0),
    depositAmount: String(data.depositAmount ?? 0),
    depositReturned: data.depositReturned === "on",
    status: data.status,
    notes: data.notes,
  };
}

function revalidateLeasePaths() {
  revalidatePath("/leases");
  revalidatePath("/tenants");
  revalidatePath("/properties");
}

export async function createLeaseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const parsed = leaseSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid lease data." };
  }

  if (!(await canManageUnit(session.user.id, parsed.data.unitId))) {
    return { error: "Unit not found." };
  }
  if (!(await ownsTenant(session.user.id, parsed.data.tenantId))) {
    return { error: "Tenant not found." };
  }
  if (
    parsed.data.status === "active" &&
    (await hasActiveLease(parsed.data.unitId))
  ) {
    return { error: "This unit already has an active lease." };
  }

  await db.insert(leases).values(leaseDbValues(parsed.data));
  await syncUnitStatus(parsed.data.unitId);

  await awardXp(session.user.id, "lease_created");
  revalidateLeasePaths();
  redirect("/leases");
}

export async function updateLeaseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const leaseId = formData.get("leaseId");
  if (typeof leaseId !== "string" || !leaseId) {
    return { error: "Missing lease id." };
  }

  // Confirm the lease's unit is on a property this user can manage
  // (owned or co-owned — not a read-only viewer) before touching anything.
  const owned = await db
    .select({ id: leases.id, unitId: leases.unitId, endDate: leases.endDate })
    .from(leases)
    .where(eq(leases.id, leaseId))
    .limit(1);
  if (!owned.length || !(await canManageUnit(session.user.id, owned[0].unitId))) {
    return { error: "Lease not found." };
  }

  const parsed = leaseSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid lease data." };
  }

  if (!(await canManageUnit(session.user.id, parsed.data.unitId))) {
    return { error: "Unit not found." };
  }
  if (!(await ownsTenant(session.user.id, parsed.data.tenantId))) {
    return { error: "Tenant not found." };
  }
  if (
    parsed.data.status === "active" &&
    (await hasActiveLease(parsed.data.unitId, leaseId))
  ) {
    return { error: "This unit already has an active lease." };
  }

  // Moving the end date re-arms the lease-end reminder email — the old
  // "already reminded" stamp would otherwise suppress it forever.
  const newEndDate = parsed.data.endDate
    ? new Date(`${parsed.data.endDate}T00:00:00Z`)
    : null;
  const endDateChanged =
    (owned[0].endDate?.getTime() ?? null) !== (newEndDate?.getTime() ?? null);

  await db
    .update(leases)
    .set({
      ...leaseDbValues(parsed.data),
      ...(endDateChanged ? { leaseEndReminderSentAt: null } : {}),
    })
    .where(eq(leases.id, leaseId));

  // A contract in flight was drawn from the terms as they were a moment ago.
  // Retire it rather than letting it be signed against stale figures — the
  // landlord re-issues, which creates the next version.
  const superseded = await supersedeOpenContracts(leaseId);

  // The unit may have changed — resync both the old and the new unit.
  await syncUnitStatus(owned[0].unitId);
  if (parsed.data.unitId !== owned[0].unitId) {
    await syncUnitStatus(parsed.data.unitId);
  }

  revalidateLeasePaths();
  revalidatePath(`/leases/${leaseId}/edit`);
  revalidatePath(`/leases/${leaseId}/contract`);
  // Landlords who edited a lease with a contract out for signature need to
  // know it's been pulled, so send them to the contract page rather than the
  // list, where the change would be invisible.
  if (superseded > 0) {
    redirect(`/leases/${leaseId}/contract?superseded=1`);
  }
  redirect("/leases");
}

export async function deleteLeaseAction(
  leaseId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const owned = await db
    .select({ id: leases.id, unitId: leases.unitId })
    .from(leases)
    .where(eq(leases.id, leaseId))
    .limit(1);
  if (
    !owned.length ||
    !(await canManageUnit(session.user.id, owned[0].unitId))
  ) {
    return { error: "Lease not found." };
  }

  await db.delete(leases).where(eq(leases.id, leaseId));
  await syncUnitStatus(owned[0].unitId);

  revalidateLeasePaths();
  return {};
}

// ---------------------------------------------------------------------------
// Charges — non-rent amounts billed to a lease (dues, penalties, a manual
// utility share). They complete the tenant's monthly statement; rent and
// sub-metered utilities are derived, so only the manual additions live here.
// ---------------------------------------------------------------------------

export async function createChargeAction(
  _prev: LeaseRecordState,
  formData: FormData,
): Promise<LeaseRecordState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const parsed = chargeSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid charge." };
  }
  const denied = await assertCanManageLease(session.user.id, parsed.data.leaseId);
  if (denied) return { error: denied };

  // The dialog sends a period start; the end and the legacy month key are
  // derived here from the lease's own due day, so a stale form can never file
  // a charge into a period this lease does not have.
  const [lease] = await db
    .select({
      startDate: leases.startDate,
      endDate: leases.endDate,
      rentDueDay: leases.rentDueDay,
    })
    .from(leases)
    .where(eq(leases.id, parsed.data.leaseId))
    .limit(1);
  if (!lease) return { error: "Lease not found." };

  const leaseStart = utcDay(lease.startDate);
  const dueDay = resolveDueDay(leaseStart, lease.rentDueDay);
  const periodStart = fromIsoDate(parsed.data.periodStart);
  const index = periodIndexForDate(periodStart, leaseStart, dueDay);
  if (
    index < 0 ||
    isoDate(periodStartAt(index, leaseStart, dueDay)) !==
      parsed.data.periodStart
  ) {
    return { error: "That billing period does not belong to this lease." };
  }
  const periodEnd = periodStartAt(index + 1, leaseStart, dueDay);

  await db.insert(charges).values({
    leaseId: parsed.data.leaseId,
    userId: session.user.id,
    // Superseded by the exact dates below; left NULL on new rows.
    periodMonth: null,
    periodStart,
    periodEnd,
    type: parsed.data.type,
    description: parsed.data.description,
    amount: String(parsed.data.amount ?? 0),
  });

  revalidatePath(`/leases/${parsed.data.leaseId}/edit`);
  revalidatePath("/leases");
  return { ok: true };
}

export async function deleteChargeAction(
  _prev: LeaseRecordState,
  formData: FormData,
): Promise<LeaseRecordState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const chargeId = String(formData.get("chargeId") ?? "");
  const leaseId = String(formData.get("leaseId") ?? "");
  if (!isUuid(chargeId) || !isUuid(leaseId)) {
    return { error: "That charge could not be found." };
  }
  const denied = await assertCanManageLease(session.user.id, leaseId);
  if (denied) return { error: denied };

  await db
    .delete(charges)
    .where(and(eq(charges.id, chargeId), eq(charges.leaseId, leaseId)));

  revalidatePath(`/leases/${leaseId}/edit`);
  revalidatePath("/leases");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Contracts — a frozen version of the lease terms, issued and signed as a pair.
// ---------------------------------------------------------------------------

/** Shape for the contract clause form. */
export type ContractFormState = { error?: string; ok?: boolean } | null;

/** Resolve a lease this user may manage, or an error to show. */
async function assertContractLease(
  userId: string,
  leaseId: string,
): Promise<{ error: string } | { leaseId: string }> {
  if (!isUuid(leaseId)) return { error: "That lease could not be found." };
  const [lease] = await db
    .select({ id: leases.id, unitId: leases.unitId })
    .from(leases)
    .where(eq(leases.id, leaseId))
    .limit(1);
  if (!lease || !(await canManageUnit(userId, lease.unitId))) {
    return { error: "That lease could not be found." };
  }
  return { leaseId };
}

/**
 * Start a contract. The mechanical clauses come off the lease as it stands
 * right now; the landlord fills in the rest on the contract page.
 */
export async function createContractAction(leaseId: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const owned = await assertContractLease(session.user.id, leaseId);
  if ("error" in owned) return owned;

  // One contract in flight at a time — sending two versions of the same terms
  // to one tenant is how you get two conflicting agreements.
  if (await activeContract(leaseId)) {
    return { error: "This lease already has a contract in progress." };
  }

  const terms = await draftTermsFromLease(leaseId);
  if (!terms) return { error: "That lease could not be found." };

  // Continue the version sequence rather than restarting it, so a voided or
  // superseded version is never reused.
  const [highest] = await db
    .select({ version: leaseContracts.version })
    .from(leaseContracts)
    .where(eq(leaseContracts.leaseId, leaseId))
    .orderBy(desc(leaseContracts.version))
    .limit(1);

  await db.insert(leaseContracts).values({
    leaseId,
    version: (highest?.version ?? 0) + 1,
    terms: JSON.stringify(terms),
    contentHash: hashContractTerms(terms),
    status: "draft",
    issuedBy: session.user.id,
  });

  revalidatePath(`/leases/${leaseId}/contract`);
  revalidatePath(`/leases/${leaseId}/edit`);
  return {};
}

/** Save the clauses the landlord wrote. Only while it's still a draft. */
export async function saveContractAction(
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const contractId = String(formData.get("contractId") ?? "");
  if (!isUuid(contractId)) return { error: "That contract could not be found." };

  const [contract] = await db
    .select({
      id: leaseContracts.id,
      leaseId: leaseContracts.leaseId,
      status: leaseContracts.status,
      terms: leaseContracts.terms,
    })
    .from(leaseContracts)
    .where(eq(leaseContracts.id, contractId))
    .limit(1);
  if (!contract) return { error: "That contract could not be found." };

  const owned = await assertContractLease(session.user.id, contract.leaseId);
  if ("error" in owned) return { error: owned.error };

  // Once sent, the words are the tenant's to read — editing them underneath
  // would be the exact drift the snapshot exists to prevent.
  if (contract.status !== "draft") {
    return { error: "This contract has already been sent and can't be edited." };
  }

  const parsed = contractTermsSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid contract terms." };
  }

  // Only the clauses are editable — the parties, premises, term and figures
  // stay exactly as they were copied off the lease.
  const existing = JSON.parse(contract.terms) as Record<string, unknown>;
  const merged: Record<string, unknown> = {
    ...existing,
    // Nothing can be sent without passing through here or the draft step, so a
    // draft edited today renders with today's wording. A contract already sent
    // is frozen and never reaches this code.
    renderVersion: CURRENT_CONTRACT_RENDER_VERSION,
  };
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) merged[key] = value;
  }
  const terms = merged as unknown as Parameters<typeof hashContractTerms>[0];

  await db
    .update(leaseContracts)
    .set({ terms: JSON.stringify(terms), contentHash: hashContractTerms(terms) })
    .where(eq(leaseContracts.id, contractId));

  revalidatePath(`/leases/${contract.leaseId}/contract`);
  return { ok: true };
}

/**
 * Hand the contract to the tenant. This freezes it: from here the wording can
 * only change by starting a new version.
 *
 * Sending also emails it. "Sent" that means "visible in a portal the tenant may
 * never open" was how this failed silently the first time; the email is the
 * thing that actually reaches them, so it's not a separate opt-in step.
 */
export async function issueContractAction(
  contractId: string,
): Promise<{ error?: string; warning?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  if (!isUuid(contractId)) return { error: "That contract could not be found." };

  const [contract] = await db
    .select({
      id: leaseContracts.id,
      leaseId: leaseContracts.leaseId,
      status: leaseContracts.status,
    })
    .from(leaseContracts)
    .where(eq(leaseContracts.id, contractId))
    .limit(1);
  if (!contract) return { error: "That contract could not be found." };

  const owned = await assertContractLease(session.user.id, contract.leaseId);
  if ("error" in owned) return { error: owned.error };

  if (contract.status !== "draft") {
    return { error: "This contract has already been sent." };
  }

  await db
    .update(leaseContracts)
    .set({ status: "sent", issuedAt: new Date(), issuedBy: session.user.id })
    .where(eq(leaseContracts.id, contractId));

  const delivery = await deliverContract(contractId);

  revalidatePath(`/leases/${contract.leaseId}/contract`);
  revalidatePath(`/leases/${contract.leaseId}/edit`);
  revalidatePath("/portal");
  // The contract is issued either way — a mail failure is worth shouting about,
  // not worth un-issuing over.
  return delivery.ok ? {} : { warning: delivery.problem ?? "The email could not be sent." };
}

/**
 * Email the contract again with a fresh signing link.
 *
 * The token is rotated, so the newest email is the only one that works. That's
 * the point when someone resends because the first never arrived, but it does
 * mean an older copy of the email stops working — worth saying out loud in the
 * confirm step.
 */
export async function resendContractAction(
  contractId: string,
): Promise<{ error?: string; warning?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  if (!isUuid(contractId)) return { error: "That contract could not be found." };

  const [contract] = await db
    .select({
      id: leaseContracts.id,
      leaseId: leaseContracts.leaseId,
      status: leaseContracts.status,
    })
    .from(leaseContracts)
    .where(eq(leaseContracts.id, contractId))
    .limit(1);
  if (!contract) return { error: "That contract could not be found." };

  const owned = await assertContractLease(session.user.id, contract.leaseId);
  if ("error" in owned) return { error: owned.error };

  if (contract.status === "draft") {
    return { error: "Send this contract to the tenant first." };
  }
  if (contract.status === "superseded" || contract.status === "voided") {
    return { error: "This version is no longer active. Prepare a new one." };
  }

  const delivery = await deliverContract(contractId);

  revalidatePath(`/leases/${contract.leaseId}/contract`);
  return delivery.ok ? {} : { warning: delivery.problem ?? "The email could not be sent." };
}

/** Withdraw a contract that hasn't been signed by both parties. */
export async function voidContractAction(contractId: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  if (!isUuid(contractId)) return { error: "That contract could not be found." };

  const [contract] = await db
    .select({
      id: leaseContracts.id,
      leaseId: leaseContracts.leaseId,
      status: leaseContracts.status,
      completedAt: leaseContracts.completedAt,
    })
    .from(leaseContracts)
    .where(eq(leaseContracts.id, contractId))
    .limit(1);
  if (!contract) return { error: "That contract could not be found." };

  const owned = await assertContractLease(session.user.id, contract.leaseId);
  if ("error" in owned) return { error: owned.error };

  // A completed contract is an executed agreement. Retracting it would leave
  // both parties holding signatures with nothing behind them.
  if (contract.completedAt) {
    return { error: "A signed contract can't be voided — issue a new version instead." };
  }
  if (!["draft", "sent", "viewed"].includes(contract.status)) {
    return { error: "This contract can't be voided." };
  }

  await db
    .update(leaseContracts)
    .set({ status: "voided", voidedAt: new Date() })
    .where(eq(leaseContracts.id, contractId));

  revalidatePath(`/leases/${contract.leaseId}/contract`);
  revalidatePath(`/leases/${contract.leaseId}/edit`);
  revalidatePath("/portal");
  return {};
}

/**
 * The landlord's signature on a specific version of the contract. The terms are
 * on screen first — you shouldn't be able to sign a document you can't see.
 */
export async function signContractAsLandlordAction(
  _prev: SignatureFormState,
  formData: FormData,
): Promise<SignatureFormState> {
  const session = await auth();
  if (!session?.user || session.user.role !== "landlord") {
    return { error: "Only landlord accounts can sign here." };
  }

  const contractId = String(formData.get("contractId") ?? "");
  if (!isUuid(contractId)) return { error: "That contract could not be found." };

  const [contract] = await db
    .select({ id: leaseContracts.id, leaseId: leaseContracts.leaseId })
    .from(leaseContracts)
    .where(eq(leaseContracts.id, contractId))
    .limit(1);
  if (!contract) return { error: "That contract could not be found." };

  const owned = await assertContractLease(session.user.id, contract.leaseId);
  if ("error" in owned) return { error: owned.error };

  const parsed = leaseSignatureSchema.safeParse({
    signerName: formData.get("signerName"),
    method: formData.get("method"),
    drawnSignature: formData.get("drawnSignature") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid signature." };
  }
  if (formData.get("attestation") !== "on") {
    return { error: "Tick the agreement box to sign." };
  }

  const signature =
    parsed.data.method === "typed"
      ? parsed.data.signerName
      : (parsed.data.drawnSignature ?? "");
  if (!signature) return { error: "Draw your signature before signing." };

  try {
    await signContract({
      contractId,
      role: "landlord",
      signerName: parsed.data.signerName,
      method: parsed.data.method,
      signature,
      // The landlord's identity is the signed-in account that manages the
      // lease — no separate code for the party who holds the document.
      verification: await accountVerification(),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Signing failed." };
  }

  revalidatePath(`/leases/${contract.leaseId}/contract`);
  revalidatePath(`/leases/${contract.leaseId}/edit`);
  revalidatePath(`/leases/${contract.leaseId}/signed`);
  return { ok: true };
}
