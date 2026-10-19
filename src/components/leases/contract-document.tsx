import { SignatureDisplay } from "@/components/leases/signature-display";
import { signatureVerificationLabels } from "@/lib/signatures";
import {
  type ContractRecord,
  type ContractSignature,
  contractPartyWords,
  formatPeso,
  renderContractSections,
  shortHash,
} from "@/lib/contracts";
import { formatDate } from "@/lib/utils";

/**
 * The contract as a party sees it. Server component — no interactivity, so it
 * can be printed and so the tenant's view is the landlord's view byte for byte.
 * That matters: the hash shown in the footer is over exactly this text.
 */
export function ContractDocument({
  contract,
  signatures,
  /** Whose signature block to feature — usually the viewer. */
  viewerRole,
}: {
  contract: ContractRecord;
  signatures: Record<"landlord" | "tenant", ContractSignature | null>;
  viewerRole: "landlord" | "tenant";
}) {
  const sections = renderContractSections(contract.terms);
  const { terms } = contract;
  // The signature blocks have to name the parties the same way the clauses
  // above them do, which for an older snapshot is still Landlord/Tenant.
  const words = contractPartyWords(terms);
  const bothSigned = signatures.landlord && signatures.tenant;
  const signedOn = bothSigned
    ? [signatures.landlord!.signedAt, signatures.tenant!.signedAt]
        .sort((a, b) => a.getTime() - b.getTime())
        .at(-1)!
    : null;

  return (
    <article className="space-y-6 rounded-lg border bg-card p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="space-y-1 border-b pb-4">
        <h2 className="text-xl font-semibold">Lease agreement</h2>
        <p className="text-sm text-muted-foreground">
          {terms.propertyName} — Unit {terms.unitName}
        </p>
        <p className="text-xs text-muted-foreground">
          Version {contract.version}
          {contract.issuedAt
            ? ` · issued ${formatDate(contract.issuedAt)}`
            : " · not yet issued"}
        </p>
      </header>

      <ol className="space-y-5">
        {sections.map((section, index) => (
          <li key={section.heading} className="space-y-2">
            <h3 className="text-sm font-semibold">
              {index + 1}. {section.heading}
            </h3>
            {section.paragraphs.map((paragraph, pIndex) => (
              <p key={pIndex} className="text-sm leading-relaxed">
                {paragraph}
              </p>
            ))}
          </li>
        ))}
      </ol>

      {/* At-a-glance figures, so nobody has to read the clauses to find the
          rent. These come from the same snapshot as the clauses above. */}
      <dl className="grid gap-4 border-t pt-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Monthly rent</dt>
          <dd className="font-medium">{formatPeso(terms.rentAmount)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Security deposit</dt>
          <dd className="font-medium">{formatPeso(terms.depositAmount)}</dd>
        </div>
      </dl>

      <section className="grid gap-6 border-t pt-6 sm:grid-cols-2">
        {(["landlord", "tenant"] as const).map((role) => {
          const signature = signatures[role];
          return (
            <div
              key={role}
              className={
                role === viewerRole ? "rounded-lg border-2 border-primary/40 p-4" : "p-4"
              }
            >
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {role === "landlord" ? words.lessor : words.lessee}
                {role === viewerRole && " · you"}
              </p>
              {signature ? (
                <div className="mt-3 space-y-1">
                  <SignatureDisplay signature={signature} />
                  <div className="border-t pt-2 text-sm">
                    <p className="font-medium">{signature.signerName}</p>
                    <p className="text-xs text-muted-foreground">
                      Signed {formatDate(signature.signedAt)} ·{" "}
                      {signature.method === "typed" ? "typed" : "drawn"} signature
                    </p>
                    {/*
                      How the signer was identified is part of the record, not
                      a detail: "a name is on it" and "the person behind that
                      name proved it" are different claims.
                    */}
                    <p
                      className={
                        signature.verifiedBy
                          ? "text-xs text-muted-foreground"
                          : "text-xs text-amber-700 dark:text-amber-400"
                      }
                    >
                      {signature.verifiedBy
                        ? signatureVerificationLabels[signature.verifiedBy]
                        : "No verification recorded"}
                      {signature.verifiedAt
                        ? ` · ${formatDate(signature.verifiedAt)}`
                        : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Not signed yet</p>
              )}
            </div>
          );
        })}
      </section>

      <footer className="space-y-2 border-t pt-4 text-xs text-muted-foreground">
        {signedOn && (
          <p>
            Signed electronically via Renta-PH.net on {formatDate(signedOn)}. Each
            party agreed that their electronic signature is the legal equivalent
            of a handwritten one.
          </p>
        )}
        {/*
          Deliberate, and not a disclaimer for its own sake: the wording of the
          deposit, late-payment and termination clauses is written by the
          landlord, not by a lawyer on this product's behalf. Saying so is more
          useful than pretending the template is authoritative.
        */}
        <p>
          These terms were prepared by the {words.lessor.toLowerCase()} and have
          not been reviewed by a lawyer. Document version {contract.version},
          content{" "}
          <code className="font-mono">{shortHash(contract.contentHash)}</code>.
        </p>
      </footer>
    </article>
  );
}