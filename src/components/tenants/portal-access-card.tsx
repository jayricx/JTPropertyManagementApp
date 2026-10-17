"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MailIcon } from "lucide-react";
import {
  sendPortalInviteAction,
  revokePortalAccessAction,
} from "@/app/(dashboard)/tenants/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PortalAccessCardProps {
  tenantId: string;
  tenantName: string;
  /** Tenant's email — becomes the portal login address. */
  email: string | null;
  /** True when an account is already linked to this roster entry. */
  granted: boolean;
}

/**
 * Grants portal access by emailing the tenant a link they use once to choose
 * their own password. The landlord never needs to know the password.
 */
export function PortalAccessCard({
  tenantId,
  tenantName,
  email,
  granted,
}: PortalAccessCardProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  /** Set once an invite goes out, so the landlord gets confirmation even though
   * the account only appears after the tenant finishes setup. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGrant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("tenantId", tenantId);
      const result = await sendPortalInviteAction(null, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSentTo(email);
    });
  }

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokePortalAccessAction(tenantId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSentTo(null);
      // Pull the fresh server state so `granted` flips back to the invite form.
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailIcon className="h-4 w-4" />
          Tenant portal
          {granted && <Badge variant="outline">Active</Badge>}
        </CardTitle>
        <CardDescription>
          Portal access lets {tenantName} sign in to view their lease, payment
          history, and maintenance requests — nothing else.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {granted ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              {email ? (
                <>
                  <span className="font-medium">{email}</span> can sign in to the
                  portal with their own password.
                </>
              ) : (
                "Portal access is active."
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={handleRevoke}
            >
              {pending ? "Revoking…" : "Revoke access"}
            </Button>
          </div>
        ) : sentTo ? (
          <div className="space-y-3">
            <p className="text-sm">
              Invite emailed to{" "}
              <span className="font-medium">{sentTo}</span> — it becomes active
              once they finish setting up.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const formData = new FormData();
                    formData.set("tenantId", tenantId);
                    const result = await sendPortalInviteAction(null, formData);
                    if (result?.error) setError(result.error);
                  });
                }}
              >
                {pending ? "Sending…" : "Resend invite"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={handleRevoke}
              >
                Cancel invite
              </Button>
              <p className="text-xs text-muted-foreground">
                The link expires in 3 days. Resending is limited to one email
                every few minutes.
              </p>
            </div>
          </div>
        ) : !email ? (
          <p className="text-sm text-muted-foreground">
            Add an email address for this tenant, then grant portal access.
          </p>
        ) : (
          <form onSubmit={handleGrant} className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Email an invite"}
            </Button>
            <p className="text-sm text-muted-foreground sm:flex-1">
              We&apos;ll email a link they use once to set up their sign-in.
            </p>
          </form>
        )}
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}