"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon, UserPlusIcon } from "lucide-react";
import {
  invitePortfolioMemberAction,
  removePortfolioMemberAction,
  updatePortfolioMemberRoleAction,
  type ActionState,
} from "@/app/(dashboard)/portfolios/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface MemberRow {
  id: string;
  name: string | null;
  email: string;
  role: "owner" | "co_owner" | "viewer";
  joinedAt: string;
  isYou: boolean;
}

/** Plain-language roles — the same wording the old per-property card used. */
const ROLE_OPTIONS: {
  value: "co_owner" | "viewer";
  label: string;
  hint: string;
}[] = [
  { value: "co_owner", label: "Co-owner", hint: "Can manage everything" },
  { value: "viewer", label: "Viewer", hint: "Read-only" },
];

function roleLabel(role: MemberRow["role"]): string {
  if (role === "owner") return "Owner — full control";
  if (role === "co_owner") return "Co-owner — can manage";
  return "Viewer — read-only";
}

/**
 * Portfolio members — one invite per person covers every property, tenant,
 * lease and custom field in the portfolio, which replaces the old
 * per-property "add co-owner" card.
 */
export function PortfolioMembersCard({
  portfolioId,
  propertyCount,
  members,
  canManage,
}: {
  portfolioId: string;
  propertyCount: number;
  members: MemberRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [inviteState, inviteAction, inviting] = useActionState<
    ActionState,
    FormData
  >(async (prev, formData) => {
    const result = await invitePortfolioMemberAction(prev, formData);
    if (!result?.error) router.refresh();
    return result;
  }, null);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {member.name || member.email}
                {member.isYou && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (you)
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {member.email} · {roleLabel(member.role)}
              </p>
            </div>
            {canManage && member.role !== "owner" && (
              <div className="flex shrink-0 items-center gap-1">
                <RoleSelect member={member} />
                <RemoveMemberButton memberId={member.id} name={member.name || member.email} />
              </div>
            )}
          </li>
        ))}
      </ul>

      {canManage ? (
        <form action={inviteAction} className="space-y-3 rounded-lg border p-3">
          <input type="hidden" name="portfolioId" value={portfolioId} />
          <div className="flex items-center gap-2 text-sm font-medium">
            <UserPlusIcon className="size-4" />
            Add someone to this portfolio
          </div>
          <p className="text-xs text-muted-foreground">
            They&rsquo;ll see all {propertyCount} propert
            {propertyCount === 1 ? "y" : "ies"}, the tenants and leases, and
            the same custom fields as you.
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input
              name="email"
              type="email"
              placeholder="their@email.com"
              aria-label="Email address"
              required
            />
            <InviteRoleSelect />
            <Button type="submit" disabled={inviting}>
              {inviting ? "Adding…" : "Add"}
            </Button>
          </div>
          {inviteState?.error && (
            <p className="text-sm font-medium text-destructive">
              {inviteState.error}
            </p>
          )}
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only the portfolio owner can add or remove people.
        </p>
      )}
    </div>
  );
}

/** Co-owner vs viewer, without a submit button per row. */
function RoleSelect({ member }: { member: MemberRow }) {
  const router = useRouter();
  const [role, setRole] = useState<string>(member.role);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await updatePortfolioMemberRoleAction(prev, formData);
      if (!result?.error) router.refresh();
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="memberId" value={member.id} />
      <input type="hidden" name="role" value={role} readOnly />
      <Select
        items={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        value={role}
        onValueChange={(v) => setRole(v ?? "viewer")}
      >
        <SelectTrigger className="h-8 w-28" aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        Save
      </Button>
      {state?.error && (
        <span className="sr-only" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}

function RemoveMemberButton({
  memberId,
  name,
}: {
  memberId: string;
  name: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await removePortfolioMemberAction(prev, formData);
      if (!result?.error) router.refresh();
      return result;
    },
    null,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="memberId" value={memberId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={`Remove ${name}`}
        title={state?.error ?? `Remove ${name}`}
      >
        <Trash2Icon />
      </Button>
    </form>
  );
}

function InviteRoleSelect() {
  const [role, setRole] = useState("co_owner");
  return (
    <>
      <input type="hidden" name="role" value={role} readOnly />
      <Select
        items={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        value={role}
        onValueChange={(v) => setRole(v ?? "co_owner")}
      >
        <SelectTrigger className="w-32" aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}