"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { GlobeIcon } from "lucide-react";
import {
  setFeatureRequestPublicAction,
  updateFeatureRequestStatusAction,
  type ActionState,
} from "@/app/(dashboard)/feedback/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FeatureRequestStatus } from "@/lib/feature-requests";

const STATUS_OPTIONS: { value: FeatureRequestStatus; label: string }[] = [
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Looking at it" },
  { value: "planned", label: "Planned" },
  { value: "shipped", label: "Shipped" },
  { value: "declined", label: "Not planned" },
];

/**
 * Answer one request: set its status, leave a note for the submitter, and
 * decide whether it belongs on the public roadmap. The note is required
 * whenever the answer is "not planned" — a flat no with no reason is the thing
 * that makes landlords stop bothering you.
 */
export function RequestTriage({
  requestId,
  status,
  isPublic,
}: {
  requestId: string;
  status: FeatureRequestStatus;
  isPublic: boolean;
}) {
  const router = useRouter();
  const [next, setNext] = useState<string>(status);
  const [note, setNote] = useState("");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await updateFeatureRequestStatusAction(prev, formData);
      if (!result?.error) {
        setNote("");
        router.refresh();
      }
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="status" value={next} readOnly />
      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
          value={next}
          onValueChange={(v) => setNext(v ?? status)}
        >
          <SelectTrigger className="h-8 w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            next === "declined"
              ? "Why not — say it plainly"
              : "Optional note to the landlord"
          }
          className="h-8 min-w-48 flex-1"
          maxLength={1000}
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Send"}
        </Button>
      </div>
      {state?.error && (
        <p className="text-xs font-medium text-destructive">{state.error}</p>
      )}
      <PublishToggle requestId={requestId} isPublic={isPublic} />
    </form>
  );
}

function PublishToggle({
  requestId,
  isPublic,
}: {
  requestId: string;
  isPublic: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await setFeatureRequestPublicAction(prev, formData);
      if (!result?.error) router.refresh();
      return result;
    },
    null,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <input
        type="hidden"
        name="public"
        value={isPublic ? "false" : "true"}
        readOnly
      />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={pending}
        className="text-xs"
      >
        <GlobeIcon className="size-3.5" />
        {pending
          ? "Saving…"
          : isPublic
            ? "Remove from public roadmap"
            : "Show on the public roadmap"}
      </Button>
      {state?.error && (
        <p className="text-xs font-medium text-destructive">{state.error}</p>
      )}
    </form>
  );
}