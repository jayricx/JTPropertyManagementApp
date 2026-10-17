"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  rejectPaymentAction,
  verifyPaymentAction,
} from "@/app/(dashboard)/finance/actions";

/**
 * Approve or turn down a tenant's pending GCash submission. Verification is
 * what makes the payment count — until then it sits outside the statement,
 * the income totals, and the reports.
 */
export function PaymentReviewActions({
  paymentId,
  amountLabel,
}: {
  paymentId: string;
  /** Formatted amount, used in the turn-down confirmation. */
  amountLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleVerify() {
    startTransition(async () => {
      const result = await verifyPaymentAction(paymentId);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleReject() {
    if (
      !window.confirm(
        `Turn down this ${amountLabel} GCash payment? It will not count toward the balance, and the tenant can resubmit a reference.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await rejectPaymentAction(paymentId);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleReject}
        disabled={pending}
        aria-label={`Turn down ${amountLabel} payment`}
      >
        <XIcon aria-hidden="true" />
        Turn down
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={handleVerify}
        disabled={pending}
        aria-label={`Verify ${amountLabel} payment`}
      >
        <CheckIcon aria-hidden="true" />
        {pending ? "Saving…" : "Verify"}
      </Button>
    </div>
  );
}
