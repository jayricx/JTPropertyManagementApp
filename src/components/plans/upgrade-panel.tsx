import Link from "next/link";
import { ArrowUpRightIcon, SparklesIcon } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function UpgradePanel({
  title,
  description,
  ctaHref = "/pricing",
  ctaLabel = "See plans",
  note,
}: {
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
  note?: string;
}) {
  return (
    <Card className="border-amber-200/60 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-amber-900 dark:text-amber-200">
        <p>{description}</p>
        {note ? <p className="text-xs opacity-80">{note}</p> : null}
      </CardContent>
      <CardFooter className="gap-2">
        <Button render={<Link href={ctaHref} />}>
          {ctaLabel}
          <ArrowUpRightIcon className="ml-1 h-4 w-4" />
        </Button>
        <Button variant="ghost" type="button" className="hidden sm:inline-flex">
          Not now
        </Button>
      </CardFooter>
    </Card>
  );
}
