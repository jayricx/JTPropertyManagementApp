import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown across the dashboard while someone is walking the demo account: makes
 * the sample-data situation explicit and points at the real funnel — the
 * "create your account" link is the whole conversion moment this demo exists
 * for.
 */
export function DemoBanner() {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <SparklesIcon aria-hidden className="size-4 shrink-0 text-amber-600" />
      <p className="min-w-0 flex-1 text-amber-900 dark:text-amber-200">
        You&apos;re exploring the <strong>demo account</strong> — everything here
        is sample data and resets periodically. Ready for the real thing?
      </p>
      <Button size="sm" render={<Link href="/register" />}>
        Create your free account
      </Button>
    </div>
  );
}
