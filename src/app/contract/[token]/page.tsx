import { notFound } from "next/navigation";
import { AlertTriangleIcon, ShieldCheckIcon } from "lucide-react";
import { ContractDocument } from "@/components/leases/contract-document";
import { SignatureDialog } from "@/components/leases/signature-dialog";
import { Badge } from "@/components/ui/badge";
import {
  CONTRACT_LINK_DAYS,
  resolveAccessToken,
  signaturesForContract,
} from "@/lib/contracts";
import { maskEmail } from "@/lib/signature-verification";
import {
  sendContractSignatureCodeAction,
  signContractByTokenAction,
} from "./actions";

export const metadata = {
  title: "Your lease agreement — Renta-PH.net",
  robots: { index: false, follow: false },
};

interface ContractTokenPageProps {
  params: Promise<{ token: string }>;
}

/**
 * The lease, opened straight from an email.
 *
 * Deliberately outside both authenticated layouts: the tenant is someone who
 * has never set a password and may never sign in, and this is the one document
 * that must not depend on them finding the app. The 256-bit token in the URL is
 * the authorisation — stored only as a hash, expiring, and rotated on every
 * resend.
 */
export default async function ContractTokenPage({
  params,
}: ContractTokenPageProps) {
  const { token } = await params;

  const found = await resolveAccessToken(token);
  if (!found) notFound();
  const { contract, linkValid, problem } = found;

  const signatures = await signaturesForContract(contract.id);
  const completed = contract.status === "completed";
  const tenantEmail = contract.terms.tenantEmail.trim();
  const landlord =
    contract.terms.landlordBusinessName ||
    contract.terms.landlordName ||
    "your landlord";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheckIcon className="size-6 text-primary" />
            Your lease agreement
          </h1>
          <p className="text-muted-foreground">
            {contract.terms.propertyName}
            {contract.terms.unitName ? ` · Unit ${contract.terms.unitName}` : ""}
          </p>
        </div>
        <Badge variant={completed ? "default" : "secondary"}>
          Version {contract.version}
        </Badge>
      </div>

      {/*
        A superseded contract is still shown rather than 404'd: the tenant
        deserves to know what happened, and a dead link reads like the app is
        broken. What they can't do is sign it.
      */}
      {problem === "superseded" && (
        <Notice
          title="This version has been replaced"
          body={`${landlord} has since issued a newer version of your lease, so this one can no longer be signed. Ask them to send you the current one.`}
        />
      )}
      {problem === "voided" && (
        <Notice
          title="This contract was withdrawn"
          body={`${landlord} withdrew this contract before it was signed. Nothing is owed and no action is needed — ask them if you were expecting one.`}
        />
      )}
      {problem === "expired" && (
        <Notice
          title="This link has expired"
          body={`Signing links stay open for ${CONTRACT_LINK_DAYS} days. Ask ${landlord} to send it again — it only takes them a moment.`}
        />
      )}
      {completed && (
        <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-4 text-sm">
          You and your landlord have both signed this contract. You can keep this
          link as a copy.
        </div>
      )}

      <ContractDocument contract={contract} signatures={signatures} viewerRole="tenant" />

      {!completed && linkValid && tenantEmail && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
          <SignatureDialog
            action={signContractByTokenAction}
            leaseId={contract.leaseId}
            contractId={contract.id}
            token={token}
            defaultName={contract.terms.tenantName}
            triggerLabel={signatures.tenant ? "Re-sign" : "Sign this contract"}
            dialogTitle={
              signatures.tenant ? "Replace your signature" : "Sign this contract"
            }
            dialogDescription={`This applies to version ${contract.version} of the terms above.`}
            resigning={Boolean(signatures.tenant)}
            submitLabel="Sign contract"
            attestation="I have read this contract and agree that my electronic signature is the legal equivalent of my handwritten signature on it."
            verification={{
              email: maskEmail(tenantEmail),
              sendCode: sendContractSignatureCodeAction,
            }}
          />
          <p className="text-xs text-muted-foreground">
            Signing here is all that&apos;s needed — nothing to print or send back.
          </p>
        </div>
      )}

      {!completed && linkValid && !tenantEmail && (
        <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-4 text-sm">
          This contract has no email address on it, so it can&apos;t be verified for
          signing. Ask {landlord} to add your email and send it again.
        </div>
      )}

      {!completed && !linkValid && (
        <p className="text-center text-sm text-muted-foreground">
          This version can&apos;t be signed — see the note above.
        </p>
      )}

      <p className="border-t pt-4 text-center text-xs text-muted-foreground">
        Sent by {landlord} through Renta-PH.net.
      </p>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/60 bg-amber-500/10 p-4">
      <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}