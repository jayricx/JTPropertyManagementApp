"use client";

import { FileSignatureIcon } from "lucide-react";
import { SignatureDialog } from "@/components/leases/signature-dialog";
import type { SignatureActionState } from "@/components/leases/signature-dialog";
import { SignatureDisplay } from "@/components/leases/signature-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LeaseSignature } from "@/lib/signatures";
import {
  signatureMethodLabels,
  signatureStatusLabels,
} from "@/lib/signatures";
import { formatDate } from "@/lib/utils";

interface LeaseSignaturesCardProps {
  leaseId: string;
  /** Who is looking at this card — drives the action and the wording. */
  viewer: "landlord" | "tenant";
  signatures: Record<"landlord" | "tenant", LeaseSignature | null>;
  /** The viewer's own name, prefilled into the signing form. */
  defaultName: string;
  landlordName: string;
  tenantName: string;
  action: (
    prev: SignatureActionState,
    formData: FormData,
  ) => Promise<SignatureActionState>;
  /** Landlord-only: link to the print-ready signed copy. */
  signedHref?: string;
}

function SignatureRow({
  label,
  name,
  signature,
}: {
  label: string;
  name: string;
  signature: LeaseSignature | null;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        {signature ? (
          <Badge className="text-[10px]">{signatureMethodLabels[signature.method]}</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            Awaiting
          </Badge>
        )}
      </div>
      {signature ? (
        <div className="mt-3 space-y-1">
          <SignatureDisplay signature={signature} />
          <p className="text-xs text-muted-foreground">
            {signature.signerName} · {formatDate(signature.signedAt)}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{name} hasn&apos;t signed.</p>
      )}
    </div>
  );
}

/** Both parties' signatures for one lease, plus the viewer's signing dialog. */
export function LeaseSignaturesCard({
  leaseId,
  viewer,
  signatures,
  defaultName,
  landlordName,
  tenantName,
  action,
  signedHref,
}: LeaseSignaturesCardProps) {
  const status =
    signatures.landlord && signatures.tenant
      ? "complete"
      : signatures.landlord || signatures.tenant
        ? "partial"
        : "unsigned";
  const own = signatures[viewer];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileSignatureIcon className="size-5" />
            Signatures
          </CardTitle>
          <CardDescription>
            {viewer === "landlord"
              ? "Sign on behalf of the landlord and see when your tenant countersigns."
              : "Both parties sign here — no printing, no scanning."}
          </CardDescription>
        </div>
        <Badge
          variant={status === "complete" ? "default" : "secondary"}
          className="shrink-0"
        >
          {signatureStatusLabels[status]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SignatureRow
            label="Landlord"
            name={landlordName}
            signature={signatures.landlord}
          />
          <SignatureRow
            label="Tenant"
            name={tenantName}
            signature={signatures.tenant}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Keyed on the signature timestamp so a successful save remounts
              the dialog closed (no setState-in-effect needed). */}
          <SignatureDialog
            key={own ? new Date(own.signedAt).getTime() : "unsigned"}
            action={action}
            leaseId={leaseId}
            defaultName={defaultName}
            resigning={Boolean(own)}
            triggerLabel="Sign lease"
            dialogTitle={own ? "Replace your signature" : "Sign this lease"}
            dialogDescription={
              own
                ? "Signing again replaces your previous mark and the date."
                : "Type your name or draw your mark, then agree to sign electronically."
            }
          />
          {status === "complete" && signedHref && (
            <Button variant="ghost" size="sm" render={<a href={signedHref} />}>
              View signed lease
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}