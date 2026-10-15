"use client";

import { useActionState } from "react";
import { CircleCheckIcon } from "lucide-react";
import {
  saveGcashSettingsAction,
  type ActionState,
} from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function GcashSettingsForm({
  gcashNumber,
  gcashName,
}: {
  gcashNumber: string;
  gcashName: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveGcashSettingsAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="gcash-number">GCash number</Label>
        <Input
          id="gcash-number"
          name="gcashNumber"
          defaultValue={gcashNumber}
          placeholder="09XX XXX XXXX"
          maxLength={20}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          The number tenants send rent to. Leave empty to remove it.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="gcash-name">Account name</Label>
        <Input
          id="gcash-name"
          name="gcashName"
          defaultValue={gcashName}
          placeholder="Name shown on the GCash account"
          maxLength={255}
          autoComplete="off"
        />
      </div>
      {state?.error && (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save GCash details"}
        </Button>
        {state?.ok && (
          <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
            <CircleCheckIcon className="size-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
