import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AlertTriangleIcon, FileTextIcon, PrinterIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, tenants, units } from "@/db/schema";
import { ContractDocument } from "@/components/leases/contract-document";
import {
  ContractEditor,
  ContractResendButton,
  ContractSendButton,
  ContractStartButton,
  ContractVoidButton,
} from "@/components/leases/contract-controls";
import { PrintButton } from "@/components/leases/print-button";
import { SignatureDialog } from "@/components/leases/signature-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canManageUnit } from "@/lib/access";
import {
  activeContract,
  completedContract,
  contractDelivery,
  contractDrift,
  contractHistory,
  contractStatusLabels,
  effectiveSignatures,
  formatPeso,
  formatLongDate,
} from "@/lib/contracts";
import { signContractAsLandlordAction } from "@/app/(dashboard)/leases/actions";
import { formatDate, isUuid } from "@/lib/utils";

interface ContractPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ superseded?: string }>;
}

/**
 * The landlord's contract workspace for one lease.
 *
 * The sequence is deliberate: prepare (clauses copied off the lease) → write
 * the clauses that aren't derivable → send (which freezes the wording) → both
 * parties sign. After sending, nothing about the text can change; a lease edit
 * supersedes the contract and the next version starts clean.
 */
export default async function LeaseContractPage({
  params,
  searchParams,
}: ContractPageProps) {
  const { id } = await params;
  const { superseded } = await searchParams;
  if (!isUuid(id)) notFound();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null; // layout redirects unauthenticated visitors

  const [lease] = await db
    .select({
      id: leases.id,
      unitId: leases.unitId,
      rentAmount: leases.rentAmount,
      depositAmount: leases.depositAmount,
    })
    .from(leases)
    .where(eq(leases.id, id))
    .limit(1);
  if (!lease || !(await canManageUnit(userId, lease.unitId))) notFound();

  const active = await activeContract(id);
  const signed = await completedContract(id);
  const history = await contractHistory(id);

  // Fall back to the signed contract so a landlord who has nothing in flight
  // still sees the executed version rather than an empty page.
  const shown = active ?? signed;
  const [signatures, drift, unitRow, tenantRow, delivery] = await Promise.all([
    shown ? effectiveSignatures(id, shown) : Promise.resolve({ landlord: null, tenant: null }),
    contractDrift(id, signed),
    db
      .select({ name: units.name })
      .from(units)
      .where(eq(units.id, lease.unitId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ email: tenants.email })
      .from(leases)
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .where(eq(leases.id, id))
      .limit(1)
      .then((rows) => rows[0]?.email ?? null),
    shown ? contractDelivery(shown.id) : Promise.resolve(null),
  ]);

  const isDraft = shown?.status === "draft";
  const canSign =
    shown !== null && (shown.status === "sent" || shown.status === "viewed");

  return (
    <div className="space-y-6">
      <Link
        href={`/leases/${id}/edit`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to the lease
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileTextIcon className="size-6 text-primary" />
            Contract
          </h1>
          <p className="text-muted-foreground">
            {shown
              ? `Unit ${unitRow?.name ?? ""} · version ${shown.version}`
              : `Unit ${unitRow?.name ?? ""}`}
          </p>
        </div>
        {shown && <PrintButton />}
      </div>

      {/* The lease moved after a contract was signed. Without this the
          discrepancy is invisible — the signed copy still says the old rent. */}
      {drift.length > 0 && signed && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/60 bg-amber-500/10 p-4">
          <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              The lease has changed since this contract was signed
            </p>
            <p className="text-sm text-muted-foreground">
              {drift.join(", ")} no longer match the signed version
              {drift.length === 1 ? "" : "s"}. The signed contract still records
              what was agreed at the time; prepare a new version to record the
              change.
            </p>
          </div>
        </div>
      )}

      {superseded === "1" && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
          <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm">
            You edited the lease, so the contract that was out for signature has
            been pulled. Prepare a new one to send the updated terms.
          </p>
        </div>
      )}

      {!shown ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No contract yet</CardTitle>
            <CardDescription>
              A contract copies the parties, unit, term, rent and deposit off
              this lease, so the tenant signs the same figures you&apos;re
              charging. Once you send it, the wording is fixed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Monthly rent</dt>
                <dd className="font-medium">{formatPeso(lease.rentAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Security deposit</dt>
                <dd className="font-medium">{formatPeso(lease.depositAmount)}</dd>
              </div>
            </dl>
            <ContractStartButton leaseId={id} />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-base">
                  Version {shown.version}
                </CardTitle>
                <CardDescription>
                  {isDraft
                    ? "Draft — nobody else can see this yet. Edit the clauses, then send it."
                    : `Frozen as sent${shown.issuedAt ? ` on ${formatLongDate(shown.issuedAt.toISOString())}` : ""}.`}
                </CardDescription>
              </div>
              <Badge variant={shown.status === "completed" ? "default" : "secondary"}>
                {contractStatusLabels[shown.status]}
              </Badge>
            </CardHeader>

            {isDraft ? (
              <CardContent className="space-y-6">
                <ContractEditor
                  contractId={shown.id}
                  values={shown.terms}
                />
                <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                  <ContractSendButton
                    contractId={shown.id}
                    contractHref={`/leases/${id}/contract`}
                    tenantEmail={tenantRow}
                  />
                  <ContractVoidButton contractId={shown.id} />
                </div>
              </CardContent>
            ) : (
              <CardContent className="space-y-3">
                {delivery && delivery.sendCount > 0 && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>
                      Emailed {delivery.sendCount}{" "}
                      {delivery.sendCount === 1 ? "time" : "times"}
                      {delivery.lastSentAt
                        ? ` · last sent ${formatDate(delivery.lastSentAt)}`
                        : ""}
                      {tenantRow ? ` · ${tenantRow}` : ""}
                    </p>
                    {delivery.lastSendError && (
                      <p className="font-medium text-destructive">
                        The last send didn&apos;t arrive: {delivery.lastSendError}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  {canSign && (
                    <SignatureDialog
                      action={signContractAsLandlordAction}
                      leaseId={id}
                      contractId={shown.id}
                      defaultName={shown.terms.landlordName}
                      triggerLabel={
                        signatures.landlord ? "Re-sign" : "Sign as landlord"
                      }
                      dialogTitle={
                        signatures.landlord
                          ? "Replace your signature"
                          : "Sign this contract"
                      }
                      dialogDescription={`You're signing version ${shown.version} for Unit ${unitRow?.name ?? ""}.`}
                      resigning={Boolean(signatures.landlord)}
                      submitLabel="Sign contract"
                      attestation="I have read this contract and agree that my electronic signature is the legal equivalent of my handwritten signature on it."
                    />
                  )}
                  {shown.status !== "completed" && (
                    <>
                      <ContractResendButton
                        contractId={shown.id}
                        tenantEmail={tenantRow}
                      />
                      <ContractVoidButton contractId={shown.id} />
                    </>
                  )}
                  {shown.status === "completed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      render={<Link href={`/leases/${id}/signed`} />}
                    >
                      View the signed copy
                    </Button>
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          {/* The document itself. In draft it's a live preview of what the
              clauses above produce, so the landlord reads the contract rather
              than the form. */}
          <div className="space-y-3">
            {isDraft && (
              <h2 className="text-sm font-medium text-muted-foreground">
                Preview — what the tenant will see
              </h2>
            )}
            <ContractDocument
              contract={shown}
              signatures={signatures}
              viewerRole="landlord"
            />
          </div>
        </>
      )}

      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Earlier versions</CardTitle>
            <CardDescription>
              Kept for the record. A superseded version is what was on the table
              when the lease changed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {history
              .filter((row) => row.id !== shown?.id)
              .map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="flex items-center gap-2">
                    <PrinterIcon className="size-4 text-muted-foreground" />
                    <span className="text-sm">Version {row.version}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {contractStatusLabels[row.status]}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatPeso(row.terms.rentAmount)}/month
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}