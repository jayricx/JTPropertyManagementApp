"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  markPayoutPaidAction,
  voidPayoutAction,
} from "@/app/(dashboard)/admin/referrals/payouts/actions";

/**
 * Settling a bounty.
 *
 * Two rules shape this: a payout past its delay can only be *paid* — voiding
 * something already owed is a decision that should leave a trail rather than
 * quietly disappear — and the method and reference are recorded because
 * "trust me, I transferred it" is not a ledger.
 */
export function PayoutSettleButtons({
  payoutId,
  isPayable,
}: {
  payoutId: string;
  isPayable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"pay" | "void" | null>(null);
  const [method, setMethod] = useState("GCash");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pay() {
    setError(null);
    start(async () => {
      const result = await markPayoutPaidAction(payoutId, method, reference);
      if (result?.error) {
        setError(result.error);
        return;
      }
      toast.success("Bounty marked paid");
      setOpen(null);
      router.refresh();
    });
  }

  function voidIt() {
    setError(null);
    start(async () => {
      const result = await voidPayoutAction(payoutId, reason);
      if (result?.error) {
        setError(result.error);
        return;
      }
      toast.success("Bounty voided");
      setOpen(null);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={!isPayable}
        onClick={() => setOpen("pay")}
        title={
          isPayable
            ? "Record a payout"
            : "Can only be settled once the delay has passed"
        }
      >
        {isPayable ? "Pay" : "Waiting"}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {open === "pay" ? (
        <>
          <Input
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="GCash"
            aria-label="Payout method"
            autoFocus
            className="h-7 w-24 text-xs"
          />
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Ref no."
            aria-label="Payout reference"
            className="h-7 w-28 text-xs"
          />
          <Button size="sm" onClick={pay} disabled={pending}>
            Confirm
          </Button>
        </>
      ) : (
        <>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why"
            aria-label="Reason for voiding"
            autoFocus
            className="h-7 w-44 text-xs"
          />
          <Button
            size="sm"
            variant="destructive"
            onClick={voidIt}
            disabled={pending}
          >
            Void
          </Button>
        </>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setOpen(null);
          setError(null);
        }}
        disabled={pending}
      >
        ✕
      </Button>
      {error && (
        <span className="text-xs font-medium text-destructive">{error}</span>
      )}
    </div>
  );
}