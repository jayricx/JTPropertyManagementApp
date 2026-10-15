import { and, eq } from "drizzle-orm";
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

export interface LeaseSignature {
  role: SignatureRole;
  signerName: string;
  method: SignatureMethod;
  /** The typed name, or a PNG data URL for drawn signatures. */
  signature: string;
  signedAt: Date;
}

/** Both signatures for a lease, keyed by role (missing role → null). */
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
    .where(eq(leaseSignatures.leaseId, leaseId));

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