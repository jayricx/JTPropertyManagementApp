"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sendRentReminderAction } from "@/app/(dashboard)/finance/rent-reminder-actions";

export interface UpcomingLease {
  leaseId: string;
  tenantName: string;
  unitName: string;
  propertyName: string;
  dueDateText: string;
  hasEmail: boolean;
}

/**
 * Manual rent reminders. Automatic reminders already go out 3 days before the
 * due date via the daily cron; this button is for the case where a landlord
 * wants to nudge sooner, or resend after a tenant ignores the first one.
 */
export function RentReminderCard({ leases }: { leases: UpcomingLease[] }) {
  if (leases.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellIcon className="size-5" /> Rent due soon
        </CardTitle>
        <CardDescription>
          Automatic reminders are sent 3 days before the due date. Use the
          button below to send one manually — useful for nudging earlier or
          resending after a tenant ignores the first one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {leases.map((l) => (
            <li
              key={l.leaseId}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{l.tenantName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {l.unitName} · {l.propertyName} · due {l.dueDateText}
                </p>
              </div>
              <ReminderButton leaseId={l.leaseId} disabled={!l.hasEmail} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ReminderButton({ leaseId, disabled }: { leaseId: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      {sent && <span className="text-xs text-muted-foreground">Sent</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await sendRentReminderAction(leaseId);
            if (result?.error) {
              setError(result.error);
            } else {
              setSent(true);
              router.refresh();
            }
          });
        }}
      >
        {pending ? "Sending…" : "Send reminder"}
      </Button>
    </div>
  );
}