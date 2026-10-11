"use client";

import { useState, useTransition, type FormEvent } from "react";
import { UserPlusIcon, XIcon } from "lucide-react";
import {
  addCoOwnerAction,
  removeCoOwnerAction,
} from "@/app/(dashboard)/properties/actions";
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
import { formatDate } from "@/lib/utils";

export interface CoOwnerEntry {
  id: string;
  name: string | null;
  email: string;
  createdAt: Date;
}

interface CoOwnersCardProps {
  propertyId: string;
  /** Only the property owner can add or remove co-owners. */
  isOwner: boolean;
  /** Owner's display name, shown to co-owners. */
  ownerLabel?: string;
  coOwners: CoOwnerEntry[];
}

export function CoOwnersCard({
  propertyId,
  isOwner,
  ownerLabel,
  coOwners,
}: CoOwnersCardProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addCoOwnerAction(propertyId, email);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setEmail("");
    });
  }

  function handleRemove(collaboratorId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeCoOwnerAction(propertyId, collaboratorId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlusIcon className="h-4 w-4" />
          Co-owners
        </CardTitle>
        <CardDescription>
          {isOwner
            ? "Share this property with a partner. Co-owners can manage its units, leases, finance, and maintenance."
            : `Shared with you by ${ownerLabel}. Only the owner can change who has access.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {coOwners.length > 0 ? (
          <ul className="divide-y">
            {coOwners.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {c.name ?? c.email}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.name ? `${c.email} · ` : ""}Added{" "}
                    {formatDate(c.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">Co-owner</Badge>
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${c.name ?? c.email}`}
                      disabled={pending}
                      onClick={() => handleRemove(c.id)}
                    >
                      <XIcon />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No co-owners yet.</p>
        )}

        {isOwner && (
          <form
            onSubmit={handleAdd}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <Input
              type="email"
              placeholder="partner@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Co-owner email"
              required
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add co-owner"}
            </Button>
          </form>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
