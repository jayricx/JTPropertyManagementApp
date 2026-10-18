import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/marketing/brand-mark";

/**
 * Marketing navigation. Public pages only — the landlord app and the tenant
 * portal bring their own chrome, so nothing here links into a signed-in area
 * except sign-in itself.
 */
export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <BrandMark />
          <span>RentBase-PH</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm" aria-label="Main">
          <Link
            href="/pricing"
            className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Pricing
          </Link>
          <Link
            href="/guides"
            className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Guides
          </Link>
          <Link
            href="/faq"
            className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" render={<Link href="/login" />}>
            Sign in
          </Button>
          <Button size="sm" render={<Link href="/register" />}>
            Get started
          </Button>
        </div>
      </div>
    </header>
  );
}