import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { leaseSignatures } from "@/db/schema";
import type { SignatureMethod, SignatureRole } from "@/lib/validations";

/**
 * Lease signatures. Both parties sign in-app (typed name or drawn mark);
 * the pair of rows is the signed lease. Nothing here needs a third-party
 * e-sign vendor — DocuSign/Hellosign can be layered on later by adding
 * provider/envelope columns without changing the UX.
 */

export const signatureRoleLabels: Record<SignatureRole, string> = {
  landlord: "Landlord",
  tenant: "Tenant",
};

export const signatureMethodLabels: Record<SignatureMethod, string> = {
  typed: "Typed signature",
  drawn: "Drawn signature",
};

/** Mirrors `signature_verified_by` in the schema. */
export const signatureVerifiedByValues = [
  "email_code",
  "account",
  "link_only",
] as const;
export type SignatureVerifiedBy = (typeof signatureVerifiedByValues)[number];

/** Short labels for signature blocks and the landlord's record. */
export const signatureVerificationLabels: Record<SignatureVerifiedBy, string> = {
  email_code: "Email verified",
  account: "Account verified",
  link_only: "Link only — not verified",
};

/** One-line explanations, for the place a landlord checks the evidence. */
export const signatureVerificationDescriptions: Record<
  SignatureVerifiedBy,
  string
> = {
  email_code: "Entered a code sent to the tenant's email address.",
  account: "Signed in to their Renta-PH.net account.",
  link_only:
    "Signed from the emailed link before email verification was required.",
};

export interface LeaseSignature {
  role: SignatureRole;
  signerName: string;
  method: SignatureMethod;
  /** The typed name, or a PNG data URL for drawn signatures. */
  signature: string;
  signedAt: Date;
}

/**
 * The lease's *bare* signature pair — the ones with no contract attached.
 *
 * Deliberately filtered: once a contract exists its signatures live on the
 * contract version, and a lease can carry both (a legacy pair and a
 * version-bound one). Reading every row here would return whichever the driver
 * happened to hand back last, which is exactly the "whose signature is this?"
 * ambiguity the contract work exists to remove. Use `effectiveSignatures` from
 * `lib/contracts` when you want the pair that actually counts.
 */
export async function getLeaseSignatures(
  leaseId: string,
): Promise<Record<SignatureRole, LeaseSignature | null>> {
  const rows = await db
    .select({
      role: leaseSignatures.role,
      signerName: leaseSignatures.signerName,
      method: leaseSignatures.method,
      signature: leaseSignatures.signature,
      signedAt: leaseSignatures.signedAt,
    })
    .from(leaseSignatures)
    .where(
      and(
        eq(leaseSignatures.leaseId, leaseId),
        isNull(leaseSignatures.contractId),
      ),
    );

  const byRole: Record<SignatureRole, LeaseSignature | null> = {
    landlord: null,
    tenant: null,
  };
  for (const row of rows) byRole[row.role] = row;
  return byRole;
}

export type SignatureStatus = "unsigned" | "partial" | "complete";

export function signatureStatus(
  signatures: Record<SignatureRole, LeaseSignature | null>,
): SignatureStatus {
  if (signatures.landlord && signatures.tenant) return "complete";
  if (signatures.landlord || signatures.tenant) return "partial";
  return "unsigned";
}

export const signatureStatusLabels: Record<SignatureStatus, string> = {
  unsigned: "Not signed yet",
  partial: "Signed — waiting on the other party",
  complete: "Signed by both parties",
};

/** Cap for a drawn mark so one signature can't bloat a row. */
export const MAX_DRAWN_SIGNATURE_BYTES = 400_000;

/**
 * Store (or replace) one party's signature. The unique index on
 * (lease_id, role) makes signing twice an update rather than a duplicate.
 */
export async function saveLeaseSignature(input: {
  leaseId: string;
  role: SignatureRole;
  signerName: string;
  method: SignatureMethod;
  signature: string;
}): Promise<void> {
  await db
    .insert(leaseSignatures)
    .values(input)
    .onConflictDoUpdate({
      target: [leaseSignatures.leaseId, leaseSignatures.role],
      set: {
        signerName: input.signerName,
        method: input.method,
        signature: input.signature,
        signedAt: new Date(),
      },
    });
}

/** Remove one party's signature (used when a lease is re-issued). */
export async function clearLeaseSignature(
  leaseId: string,
  role: SignatureRole,
): Promise<void> {
  await db
    .delete(leaseSignatures)
    .where(
      and(eq(leaseSignatures.leaseId, leaseId), eq(leaseSignatures.role, role)),
    );
}