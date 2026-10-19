"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProgramAction } from "@/app/(dashboard)/admin/referrals/payouts/actions";

/**
 * The programme's dial. Every referred landlord's first verified payment
 * accrues a real liability, so the amount and the switch belong here rather
 * than in a deploy.
 */
export function PayoutControls({
  enabled,
  bountyAmount,
  payoutDelayDays,
}: {
  enabled: boolean;
  bountyAmount: number;
  payoutDelayDays: number;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [amount, setAmount] = useState(String(bountyAmount));
  const [delay, setDelay] = useState(String(payoutDelayDays));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const result = await updateProgramAction({
        enabled: on,
        bountyAmount: Number(amount),
        payoutDelayDays: Number(delay),
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      toast.success(on ? "Referral programme is on" : "Referral programme paused", {
        description: on
          ? `₱${Number(amount).toLocaleString()} per referred landlord, after ${delay} days.`
          : "No new bounties will be created.",
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => setOn(e.target.checked)}
            className="size-4 accent-primary"
          />
          Programme is {on ? "on" : "paused"}
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="bounty">Bounty (₱)</Label>
          <Input
            id="bounty"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="w-28"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="delay">Delay before it&apos;s owed (days)</Label>
          <Input
            id="delay"
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
            inputMode="numeric"
            className="w-24"
          />
        </div>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Pausing stops new bounties being created. It doesn&apos;t cancel ones
        already owed or waiting — settle or void those below.
      </p>

      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}