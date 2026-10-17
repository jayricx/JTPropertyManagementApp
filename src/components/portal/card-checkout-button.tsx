"use client";

import { useActionState, useEffect } from "react";
import { CreditCardIcon } from "lucide-react";
import {
  startCardCheckoutAction,
  type CardCheckoutState,
} from "@/app/(tenant)/portal/actions";
import { Button } from "@/components/ui/button";

/**
 * Starts a card payment. The action creates a hosted checkout session and
 * returns its URL; the browser is sent there to complete the charge. Nothing
 * is recorded as paid until the gateway webhook confirms it.
 */
export function CardCheckoutButton({ leaseId }: { leaseId: string }) {
  const [state, formAction, pending] = useActionState<
    CardCheckoutState,
    FormData
  >(startCardCheckoutAction, null);

  useEffect(() => {
    if (state?.url) {
      window.location.href = state.url;
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="leaseId" value={leaseId} />
      {state?.error && (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      )}
      <Button type="submit" disabled={pending}>
        <CreditCardIcon />
        {pending ? "Opening secure checkout…" : "Pay with card"}
      </Button>
    </form>
  );
}
