"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/app/(dashboard)/settings/actions";
import { saveBusinessNameAction } from "@/app/(dashboard)/settings/actions";

/**
 * The trading name shown on lease contracts instead of the personal one.
 * Saving an empty field clears it and puts the personal name back.
 */
export function BusinessNameForm({ businessName }: { businessName: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveBusinessNameAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-3">
      <div className="min-w-64 flex-1 space-y-1.5">
        <label htmlFor="businessName" className="text-sm font-medium">
          Business name
        </label>
        <Input
          id="businessName"
          name="businessName"
          defaultValue={businessName}
          maxLength={200}
          placeholder="Santos Property Holdings"
        />
        <p className="text-xs text-muted-foreground">
          Leave blank to use your own name on contracts.
        </p>
      </div>
      <Button type="submit" disabled={pending} className="mt-7">
        {pending ? "Saving..." : "Save"}
      </Button>
      {state?.error && (
        <p className="w-full text-sm font-medium text-destructive">{state.error}</p>
      )}
      {state?.ok && (
        <p className="w-full text-sm font-medium text-emerald-600 dark:text-emerald-400">
          Saved. New contracts will use it — contracts already sent keep the name
          they were signed with.
        </p>
      )}
    </form>
  );
}