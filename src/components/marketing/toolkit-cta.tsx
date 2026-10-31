import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * The conversion block under every free tool: the tool does one thing by
 * hand, the app does it (and the rest of the job) automatically. Both exits
 * point further down the funnel — the demo for browsers, register for
 * deciders.
 */
export function ToolkitCta({
  headline,
  body,
}: {
  headline: string;
  body: string;
}) {
  return (
    <section className="mt-14 rounded-xl border bg-muted/40 p-6 print:hidden sm:p-8">
      <h2 className="text-xl font-bold tracking-tight">{headline}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{body}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button render={<Link href="/try-demo" />}>Try the live demo</Button>
        <Button variant="outline" render={<Link href="/register" />}>
          Start free — up to 5 units
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Free templates and tools stay free, always — no account required to use
        anything on this page.
      </p>
    </section>
  );
}
