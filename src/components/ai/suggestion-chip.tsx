"use client";

import { SparklesIcon, WandIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AiSource } from "@/lib/ai";
import { cn } from "@/lib/utils";

/**
 * A suggestion row under a form field. The source badge is the point: with
 * no model configured these are rule-based and must not look like AI, so
 * the chip says which produced it.
 */
export function SuggestionChip({
  title,
  detail,
  source,
  onApply,
  applied = false,
  thinking = false,
}: {
  title: string;
  detail?: string;
  source: AiSource;
  /** Omit to render the suggestion read-only. */
  onApply?: () => void;
  applied?: boolean;
  thinking?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-sm">
      <span className="mt-0.5 shrink-0 text-primary">
        {source === "ai" ? <SparklesIcon className="size-4" /> : <WandIcon className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          <span className="truncate">{title}</span>
          <span
            className={cn(
              "rounded-full border px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase",
              source === "ai"
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            {source === "ai" ? "AI" : "Rules"}
          </span>
        </p>
        {detail && (
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        )}
      </div>
      {onApply && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={onApply}
          disabled={applied || thinking}
        >
          {applied ? "Applied" : "Apply"}
        </Button>
      )}
      {thinking && (
        <span className="shrink-0 text-xs text-muted-foreground">Checking…</span>
      )}
    </div>
  );
}