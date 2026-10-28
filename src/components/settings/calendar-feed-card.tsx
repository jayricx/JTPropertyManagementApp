"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { regenerateCalendarFeedAction } from "@/app/(dashboard)/settings/actions";

/**
 * The calendar-feed URL with copy and regenerate. Regenerating kills every
 * subscription that used the old link — the recovery for a leaked URL.
 */
export function CalendarFeedCard({ feedUrl }: { feedUrl: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (permissions, plain http); fall back to
      // letting the user select the readonly input themselves.
      setCopied(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={feedUrl}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Calendar feed URL"
          className="min-w-0 flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copy()}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await regenerateCalendarFeedAction();
              router.refresh();
            })
          }
        >
          <RefreshCwIcon className={pending ? "animate-spin" : undefined} />
          {pending ? "Regenerating…" : "Regenerate link"}
        </Button>
      </div>
      {pending && (
        <p className="text-xs text-muted-foreground">
          Calendar apps subscribed with the old link will stop updating on
          their next refresh — add the new link once this finishes.
        </p>
      )}
    </div>
  );
}
