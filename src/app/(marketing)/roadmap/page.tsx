import type { Metadata } from "next";
import Link from "next/link";
import { LightbulbIcon } from "lucide-react";
import { RequestStatusBadge } from "@/components/feedback/request-status-badge";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, ROADMAP_STATUSES, publicRoadmap } from "@/lib/feature-requests";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Roadmap — Renta-PH",
  description:
    "What Filipino landlords have asked Renta-PH to build, and what we're working on. See an idea missing? Send it in.",
};

/**
 * The public roadmap. Only what the owner has chosen to publish, and never
 * with a name attached — a landlord describing a unit and a tenant in public
 * is a privacy leak, and "requested by 3 people" is noise at this scale.
 */
export default async function RoadmapPage() {
  const requests = await publicRoadmap();

  const grouped = ROADMAP_STATUSES.map((status) => ({
    status,
    items: requests.filter((r) => r.status === status),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Roadmap</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        What landlords have asked us to build
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Everything here came from a Filipino landlord telling us what was
        getting in their way. We publish the ideas we&apos;re working on — and
        the ones we&apos;ve finished — so you can see where the product is
        going.
      </p>

      {grouped.length === 0 ? (
        <div className="mt-10 rounded-lg border p-8 text-center">
          <LightbulbIcon className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 font-medium">Nothing published yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            We&apos;re still early, so the roadmap is sparse. If something is
            missing for the way you run your buildings, tell us — that&apos;s
            what builds this list.
          </p>
          <Button className="mt-5" render={<Link href="/register" />}>
            Create a free account
          </Button>
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {grouped.map((group) => (
            <section key={group.status}>
              <div className="flex items-center gap-3">
                <RequestStatusBadge status={group.status} />
                <span className="text-sm text-muted-foreground">
                  {group.items.length}{" "}
                  {group.items.length === 1 ? "idea" : "ideas"}
                </span>
              </div>
              <ul className="mt-4 space-y-3">
                {group.items.map((item) => (
                  <li key={item.id} className="rounded-lg border p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="font-semibold">{item.title}</h2>
                      <span className="text-xs text-muted-foreground">
                        {CATEGORY_LABELS[item.category]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {item.details}
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Requested by a landlord in the Philippines · updated{" "}
                      {formatDate(item.updatedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="mt-12 rounded-lg border bg-muted/40 p-6">
        <h2 className="font-semibold">Something missing?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Feature requests go through your account so we can come back to you
          when something changes — the roadmap never shows who asked for what.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button render={<Link href="/register" />}>
            Create a free account
          </Button>
          <Button variant="outline" render={<Link href="/guides" />}>
            Read the guides
          </Button>
        </div>
      </div>
    </div>
  );
}