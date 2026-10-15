"use client";

import { useActionState } from "react";
import { SmartphoneIcon } from "lucide-react";
import { confirmGcashPaymentAction, type ActionState } from "@/app/(tenant)/portal/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Submit the GCash reference number after sending rent from the GCash app.
 * The payment records on success; the landlord verifies the reference.
 */
export function GcashReferenceForm({ leaseId }: { leaseId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    confirmGcashPaymentAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="leaseId" value={leaseId} />
      <div className="space-y-2">
        <Label htmlFor="gcash-reference">GCash reference number</Label>
        <Input
          id="gcash-reference"
          name="reference"
          placeholder="e.g. 1234567890123"
          required
          maxLength={32}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Found on your GCash confirmation screen, right after you send the
          money.
        </p>
        {state?.error && (
          <p className="text-sm font-medium text-destructive">{state.error}</p>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        <SmartphoneIcon />
        {pending ? "Submitting..." : "I've paid — submit reference"}
      </Button>
    </form>
  );
}
