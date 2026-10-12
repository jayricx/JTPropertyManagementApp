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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";

export type CollaboratorRole = "co_owner" | "viewer";

export interface CoOwnerEntry {
  id: string;
  name: string | null;
  email: string;
  role: CollaboratorRole;
  createdAt: Date;
}

const roleOptions: { value: CollaboratorRole; label: string }[] = [
  { value: "co_owner", label: "Co-owner — can manage" },
  { value: "viewer", label: "Viewer — read-only" },
];

interface CoOwnersCardProps {
  propertyId: string;
  /** Only the property owner can add or remove collaborators. */
  isOwner: boolean;
  /** Owner's display name, shown to collaborators. */
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
  const [role, setRole] = useState<CollaboratorRole>("co_owner");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addCoOwnerAction(propertyId, email, role);
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
          Sharing
        </CardTitle>
        <CardDescription>
          {isOwner
            ? "Share this property with a partner. Co-owners can manage its units, leases, finance, and maintenance; viewers can only look."
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
                  <Badge variant="outline">
                    {c.role === "viewer" ? "Viewer" : "Co-owner"}
                  </Badge>
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
          <p className="text-sm text-muted-foreground">
            Not shared with anyone yet.
          </p>
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
              aria-label="Collaborator email"
              className="sm:flex-1"
              required
            />
            <Select
              items={roleOptions}
              value={role}
              onValueChange={(v) => setRole(v as CollaboratorRole)}
            >
              <SelectTrigger className="w-full sm:w-56" aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Share"}
            </Button>
          </form>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
