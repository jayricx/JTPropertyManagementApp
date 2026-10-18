import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leaseContracts, leases, tenants } from "@/db/schema";
import { ContractDocument } from "@/components/leases/contract-document";
import { SignatureDialog } from "@/components/leases/signature-dialog";
import { Badge } from "@/components/ui/badge";
import {
  type ContractRecord,
  contractStatusLabels,
  markContractViewed,
  parseContractTerms,
  signaturesForContract,
} from "@/lib/contracts";
import { signContractAsTenantAction } from "@/app/(tenant)/portal/actions";
import { isUuid } from "@/lib/utils";

interface TenantContractPageProps {
  params: Promise<{ leaseId: string }>;
}

/**
 * What the tenant is actually signing.
 *
 * The whole document sits above the signature control, because a signature over
 * a summary card is what this feature exists to fix. The clauses come from the
 * frozen snapshot, so editing the landlord's lease afterwards cannot change
 * what is on this page.
 */
export default async function TenantContractPage({
  params,
}: TenantContractPageProps) {
  const { leaseId } = await params;
  if (!isUuid(leaseId)) notFound();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null; // portal layout redirects unauthenticated visitors

  // Ownership first: a contract id from someone else's lease must not be
  // readable, so the lease is proven to be this account's before any contract
  // row is loaded.
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.accountId, userId))
    .limit(1);
  if (!tenant) notFound();

  const [mine] = await db
    .select({ id: leases.id })
    .from(leases)
    .where(and(eq(leases.id, leaseId), eq(leases.tenantId, tenant.id)))
    .limit(1);
  if (!mine) notFound();

  // Only the newest version is offered — an older one was superseded precisely
  // because it stopped being what was agreed.
  const [row] = await db
    .select()
    .from(leaseContracts)
    .where(
      and(
        eq(leaseContracts.leaseId, leaseId),
        inArray(leaseContracts.status, ["sent", "viewed", "completed"]),
      ),
    )
    .orderBy(desc(leaseContracts.version))
    .limit(1);
  if (!row) notFound();

  // Opening it is the "they've at least seen it" signal the landlord is
  // waiting on. Safe to do while rendering: the update is guarded on the row
  // still being `sent`, so a re-render can't move the timestamp twice.
  await markContractViewed(row.id);

  const signatures = await signaturesForContract(row.id);
  const contract: ContractRecord = {
    id: row.id,
    leaseId: row.leaseId,
    version: row.version,
    terms: parseContractTerms(row.terms),
    contentHash: row.contentHash,
    status: row.status,
    issuedAt: row.issuedAt,
    viewedAt: row.viewedAt,
    landlordSignedAt: row.landlordSignedAt,
    tenantSignedAt: row.tenantSignedAt,
    completedAt: row.completedAt,
    voidedAt: row.voidedAt,
    createdAt: row.createdAt,
  };
  const completed = row.status === "completed";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/portal"
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to your portal
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your lease contract</h1>
          <p className="text-muted-foreground">
            From{" "}
            {contract.terms.landlordBusinessName ||
              contract.terms.landlordName ||
              "your landlord"}
          </p>
        </div>
        <Badge variant={completed ? "default" : "secondary"}>
          {contractStatusLabels[contract.status]}
        </Badge>
      </div>

      {completed ? (
        <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-4 text-sm">
          You and your landlord have both signed this contract. Keep this page —
          you can come back to it any time from your portal.
        </div>
      ) : (
        <div className="rounded-lg border p-4 text-sm">
          Read the whole thing below. When you&apos;re happy with it, sign at
          the bottom — typing your name or drawing your mark both count as a
          legal signature.
        </div>
      )}

      <ContractDocument contract={contract} signatures={signatures} viewerRole="tenant" />

      {!completed && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
          <SignatureDialog
            action={signContractAsTenantAction}
            leaseId={leaseId}
            contractId={row.id}
            defaultName={contract.terms.tenantName}
            triggerLabel={signatures.tenant ? "Re-sign" : "Sign this contract"}
            dialogTitle={
              signatures.tenant ? "Replace your signature" : "Sign this contract"
            }
            dialogDescription={`This applies to version ${row.version} of the terms above.`}
            resigning={Boolean(signatures.tenant)}
            submitLabel="Sign contract"
            attestation="I have read this contract and agree that my electronic signature is the legal equivalent of my handwritten signature on it."
          />
          <p className="text-xs text-muted-foreground">
            You&apos;re signed in, so this signature is tied to your account —
            no code to wait for. Nothing to print or send back.
          </p>
        </div>
      )}
    </div>
  );
}