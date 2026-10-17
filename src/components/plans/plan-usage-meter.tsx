import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PlanUsageMeter({
  planLabel,
  used,
  limit,
  atLimit,
  className,
}: {
  planLabel: string;
  used: number;
  limit: number | null;
  atLimit: boolean;
  className?: string;
}) {
  const limitText = limit === null ? "unlimited" : String(limit);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <span>
        {planLabel} plan · {used} of {limitText} units used
      </span>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        {atLimit ? "Upgrade" : "See plans"}
        <ArrowUpRightIcon className="h-3 w-3" />
      </Link>
    </div>
  );
}
