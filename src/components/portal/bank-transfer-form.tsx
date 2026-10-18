"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { LandmarkIcon } from "lucide-react";
import { confirmBankTransferPaymentAction } from "@/app/(tenant)/portal/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptPhotoInput } from "@/components/portal/receipt-photo-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PayableBankAccount } from "@/lib/portal-lease";

/**
 * Submit a bank-transfer payment: which of the landlord's accounts received
 * the money, the transaction reference from the bank confirmation screen, and
 * optionally a photo of that confirmation. The submission records as pending —
 * the landlord verifies it against their bank statement before it counts.
 */
export function BankTransferForm({
  leaseId,
  accounts,
}: {
  leaseId: string;
  accounts: PayableBankAccount[];
}) {
  const [bankAccountId, setBankAccountId] = useState("");
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
      formData.set("bankAccountId", bankAccountId);
      formData.set("reference", reference);
      if (receipt) formData.set("receipt", receipt);
      const result = await confirmBankTransferPaymentAction(null, formData);
      // Success redirects to the portal; only an error comes back here.
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="bank-account">Account you sent to</Label>
        <Select
          items={accounts.map((a) => ({
            value: a.id,
            label: `${a.bankName} — ${a.accountNumber}`,
          }))}
          value={bankAccountId}
          onValueChange={(v) => setBankAccountId(v ?? "")}
        >
          <SelectTrigger className="w-full" id="bank-account">
            <SelectValue placeholder="Choose an account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.bankName} — {a.accountNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="bank-reference">Transaction reference number</Label>
        <Input
          id="bank-reference"
          name="reference"
          placeholder="e.g. 1234567890123"
          required
          maxLength={32}
          autoComplete="off"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Found on your bank&apos;s confirmation screen, right after you send
          the money. The payment shows as <strong>awaiting verification</strong>{" "}
          until your landlord checks it.
        </p>
      </div>

      <ReceiptPhotoInput onChange={setReceipt} busy={pending} />

      {error && (
        <p className="text-sm font-medium text-destructive">{error}</p>
      )}
      <Button type="submit" disabled={pending}>
        <LandmarkIcon />
        {pending ? "Submitting..." : "I've paid — submit reference"}
      </Button>
    </form>
  );
}