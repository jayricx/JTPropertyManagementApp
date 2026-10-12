"use client";

import { useState, useTransition, type FormEvent } from "react";
import { KeyRoundIcon } from "lucide-react";
import {
  grantPortalAccessAction,
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
import { Input } from "@/components/ui/input";

interface PortalAccessCardProps {
  tenantId: string;
  tenantName: string;
  /** Tenant's email — becomes the portal login address. */
  email: string | null;
  /** True when a tenant-role account is already linked. */
  granted: boolean;
}

export function PortalAccessCard({
  tenantId,
  tenantName,
  email,
  granted,
}: PortalAccessCardProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGrant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("tenantId", tenantId);
      formData.set("password", password);
      const result = await grantPortalAccessAction(null, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setPassword("");
    });
  }

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokePortalAccessAction(tenantId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="h-4 w-4" />
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
                  Signs in with{" "}
                  <span className="font-medium">{email}</span>
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
        ) : !email ? (
          <p className="text-sm text-muted-foreground">
            Add an email address for this tenant, then grant portal access.
          </p>
        ) : (
          <form onSubmit={handleGrant} className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              placeholder="Portal password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Portal password"
              autoComplete="new-password"
              minLength={8}
              required
              className="sm:flex-1"
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Granting…" : "Grant access"}
            </Button>
          </form>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
