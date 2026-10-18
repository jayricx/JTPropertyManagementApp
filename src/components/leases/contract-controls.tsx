"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { MailIcon, SendIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ContractFormState } from "@/app/(dashboard)/leases/actions";
import {
  createContractAction,
  issueContractAction,
  resendContractAction,
  saveContractAction,
  voidContractAction,
} from "@/app/(dashboard)/leases/actions";
import type { ContractTerms } from "@/lib/contracts";

/**
 * The three decisions that move a contract forward: start one, send it, or
 * throw it away. Each one is destructive in its own way, so each confirms —
 * "send" can't be undone by re-editing, only by issuing a new version.
 */
export function ContractStartButton({ leaseId }: { leaseId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setError(null);
    setPending(true);
    try {
      const result = await createContractAction(leaseId);
      if (result.error) setError(result.error);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handle} disabled={pending}>
        {pending ? "Preparing..." : "Prepare contract"}
      </Button>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}

export function ContractSendButton({
  contractId,
  contractHref,
  tenantEmail,
}: {
  contractId: string;
  /** Where the read-only version lives, for the confirm step's link. */
  contractHref: string;
  /** Shown in the confirmation so the address can't be a surprise. */
  tenantEmail: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setError(null);
    setPending(true);
    try {
      const result = await issueContractAction(contractId);
      setConfirming(false);
      if (result.error) {
        setError(result.error);
      } else if (result.warning) {
        // The contract is out there either way — but the tenant has not been
        // told, and saying "sent" here would be a lie.
        toast.warning("Contract issued, but the email didn't go out", {
          description: `${result.warning} It's in their portal, and you can resend.`,
        });
        router.refresh();
      } else {
        toast.success("Contract sent", {
          description: `Emailed to ${tenantEmail || "your tenant"} with a link to read and sign it.`,
        });
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      {confirming ? (
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-sm">
            Sending freezes this wording and emails it to{" "}
            <strong>{tenantEmail || "your tenant"}</strong>. You won&apos;t be
            able to edit it afterwards — changes go on a new version, which the
            tenant signs again.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The email carries a link they can use without making an account.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={handle} disabled={pending}>
              <SendIcon />
              {pending ? "Sending..." : "Yes, send it"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="ghost"
              render={<a href={contractHref} />}
              className="text-muted-foreground"
            >
              Read it again
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setConfirming(true)} disabled={pending}>
          <SendIcon />
          Send to tenant
        </Button>
      )}
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Send the contract email again, with a new signing link.
 *
 * Reports the outcome honestly — including when the provider refused it. A
 * silent resend is how "I resent it and they still say they got nothing"
 * happens.
 */
export function ContractResendButton({
  contractId,
  tenantEmail,
}: {
  contractId: string;
  tenantEmail: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setError(null);
    setPending(true);
    try {
      const result = await resendContractAction(contractId);
      setConfirming(false);
      if (result.error) {
        setError(result.error);
      } else if (result.warning) {
        toast.error("The email still didn't go out", {
          description: result.warning,
        });
        router.refresh();
      } else {
        toast.success("Contract resent", {
          description: `Emailed to ${tenantEmail || "your tenant"}.`,
        });
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      {confirming ? (
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-sm">
            Send the lease again to{" "}
            <strong>{tenantEmail || "your tenant"}</strong>? This issues a new
            signing link and{" "}
            <strong>invalidates the previous one</strong> — any older email
            they still have will stop working.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={handle} disabled={pending}>
              <MailIcon />
              {pending ? "Sending..." : "Resend"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setConfirming(true)} disabled={pending}>
          <MailIcon />
          Resend to tenant
        </Button>
      )}
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}

export function ContractVoidButton({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setError(null);
    setPending(true);
    try {
      const result = await voidContractAction(contractId);
      setConfirming(false);
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Contract discarded");
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      {confirming ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm">
            This pulls the contract from your tenant&apos;s portal. It stays on
            file as a discarded draft — nothing is deleted.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={handle}
              disabled={pending}
            >
              {pending ? "Discarding..." : "Discard it"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirming(true)}
          disabled={pending}
        >
          <Trash2Icon />
          Discard
        </Button>
      )}
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}

/**
 * The clause form. Every field is optional and blank fields drop out of the
 * rendered contract entirely, so a landlord can leave alone whatever the
 * standard arrangement already covers for them.
 */
export function ContractEditor({
  contractId,
  values,
}: {
  contractId: string;
  values: ContractTerms;
}) {
  const [state, formAction, pending] = useActionState<ContractFormState, FormData>(
    saveContractAction,
    null,
  );
  const [count, setCount] = useState<number | null>(null);

  const fields: Array<{
    name: keyof ContractTerms;
    label: string;
    hint: string;
    rows: number;
  }> = [
    {
      name: "utilitiesNote",
      label: "Utilities and other charges",
      hint: "Who pays which bill. This is where most disagreements come from — electricity, water, internet, parking, association dues.",
      rows: 4,
    },
    {
      name: "depositTerms",
      label: "Deposit terms",
      hint: "When it comes back, and what deductions are allowed. Leave blank to state only the amount.",
      rows: 3,
    },
    {
      name: "lateFeeNote",
      label: "Late payment",
      hint: "Leave blank for no penalty clause at all.",
      rows: 3,
    },
    {
      name: "repairsNote",
      label: "Repairs and maintenance",
      hint: "Which repairs are yours to pay for, and how to report one.",
      rows: 3,
    },
    {
      name: "terminationNote",
      label: "Termination and move-out",
      hint: "Notice either side gives, and what happens at move-out. Worth having a lawyer check this one.",
      rows: 3,
    },
    {
      name: "houseRules",
      label: "House rules",
      hint: "Quiet hours, visitors, pets, parking, garbage. Line-separated is fine.",
      rows: 5,
    },
    {
      name: "additionalTerms",
      label: "Additional terms",
      hint: "Anything else that applies to this unit specifically.",
      rows: 4,
    },
  ];

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="contractId" value={contractId} />

      {fields.map((field) => (
        <div key={field.name} className="space-y-1.5">
          <label htmlFor={field.name} className="text-sm font-medium">
            {field.label}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              optional
            </span>
          </label>
          <p className="text-xs text-muted-foreground">{field.hint}</p>
          <textarea
            id={field.name}
            name={field.name}
            defaultValue={values[field.name] ?? ""}
            rows={field.rows}
            maxLength={4000}
            onChange={() => setCount((n) => (n === null ? null : n + 1))}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
      ))}

      {state?.error && (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
          Saved. The preview below is what the tenant will see.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save clauses"}
      </Button>
      {/* Keeps the preview honest: the typed text isn't live-rendered, so the
          landlord is told to save rather than shown a stale document. */}
      {count !== null && !pending && !state?.ok && (
        <p className="text-xs text-muted-foreground">
          You have unsaved changes — save to refresh the preview.
        </p>
      )}
    </form>
  );
}