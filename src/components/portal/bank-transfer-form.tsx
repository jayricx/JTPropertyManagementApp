"use client";

import { useActionState, useState } from "react";
import { LandmarkIcon } from "lucide-react";
import {
  confirmBankTransferPaymentAction,
  type ActionState,
} from "@/app/(tenant)/portal/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
 * the money, and the transaction reference from the bank confirmation
 * screen. The submission records as pending — the landlord verifies it
 * against their bank statement before it counts.
 */
export function BankTransferForm({
  leaseId,
  accounts,
}: {
  leaseId: string;
  accounts: PayableBankAccount[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    confirmBankTransferPaymentAction,
    null,
  );
  // The Select is controlled so the chosen account can ride along in a
  // hidden input — Base UI's Select doesn't submit a form field on its own.
  const [bankAccountId, setBankAccountId] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="leaseId" value={leaseId} />
      <input type="hidden" name="bankAccountId" value={bankAccountId} />
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
        />
        <p className="text-xs text-muted-foreground">
          Found on your bank&apos;s confirmation screen, right after you send
          the money. The payment shows as <strong>awaiting verification</strong>{" "}
          until your landlord checks it.
        </p>
        {state?.error && (
          <p className="text-sm font-medium text-destructive">{state.error}</p>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        <LandmarkIcon />
        {pending ? "Submitting..." : "I've paid — submit reference"}
      </Button>
    </form>
  );
}
