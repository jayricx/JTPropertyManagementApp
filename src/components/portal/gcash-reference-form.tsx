"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { SmartphoneIcon } from "lucide-react";
import { confirmGcashPaymentAction } from "@/app/(tenant)/portal/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptPhotoInput } from "@/components/portal/receipt-photo-input";

/**
 * Submit the GCash reference number after sending rent from the GCash app,
 * optionally with a photo of the confirmation screen. The submission records
 * as pending — the landlord verifies it before it counts.
 */
export function GcashReferenceForm({ leaseId }: { leaseId: string }) {
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leaseId", leaseId);
      formData.set("reference", reference);
      if (receipt) formData.set("receipt", receipt);
      const result = await confirmGcashPaymentAction(null, formData);
      // Success redirects to the portal; only an error comes back here.
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="gcash-reference">GCash reference number</Label>
        <Input
          id="gcash-reference"
          name="reference"
          placeholder="e.g. 1234567890123"
          required
          maxLength={32}
          autoComplete="off"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Found on your GCash confirmation screen, right after you send the
          money. The payment shows as <strong>awaiting verification</strong>{" "}
          until your landlord checks it.
        </p>
      </div>

      <ReceiptPhotoInput onChange={setReceipt} busy={pending} />

      {error && (
        <p className="text-sm font-medium text-destructive">{error}</p>
      )}
      <Button type="submit" disabled={pending}>
        <SmartphoneIcon />
        {pending ? "Submitting..." : "I've paid — submit reference"}
      </Button>
    </form>
  );
}