import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Icon-chip tints for the KPI cards. Primary is the brand emerald; the rest
 * pull from the chart ramp so the dashboard reads as one system.
 */
const tones = {
  primary: "bg-primary/10 text-primary",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  gold: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
} as const;

export type StatTone = keyof typeof tones;

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: StatTone;
  className?: string;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "primary",
  className,
}: StatCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="flex items-center gap-4 p-6">
        <div className={cn("rounded-lg p-2.5", tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-semibold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}