"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/marketing/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Marketing navigation. Public pages only — the landlord app and the tenant
 * portal bring their own chrome, so nothing here links into a signed-in area
 * except sign-in itself.
 *
 * On desktop the links and the sign-in / get-started actions sit inline. Below
 * `md` they collapse into a hamburger drawer (same hand-rolled pattern as the
 * dashboard sidebar) because the full row overflows a phone-width header.
 */

const navLinks = [
  { href: "/pricing", label: "Pricing" },
  { href: "/learn", label: "Learn" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/guides", label: "Guides" },
  { href: "/faq", label: "FAQ" },
];

const linkClass =
  "rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

export function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Lock background scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    // The drawer is a sibling of the header, not a child: the header's
    // `backdrop-blur` (a backdrop-filter) would otherwise become the containing
    // block for the drawer's `position: fixed`, trapping it in the 64px-tall
    // header instead of letting it cover the viewport.
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <BrandMark />
          <span>Renta-PH.net</span>
        </Link>

        {/* Desktop links */}
        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Main"
        >
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Button variant="ghost" size="sm" render={<Link href="/login" />}>
            Sign in
          </Button>
          <Button size="sm" render={<Link href="/register" />}>
            Get started
          </Button>
        </div>

          {/* Mobile menu toggle — the only way to reach the links on small screens. */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>
        </div>
      </header>

      {/* Mobile drawer — kept outside the blurred header so `fixed inset-0`
          covers the whole viewport. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="absolute inset-y-0 right-0 flex w-64 flex-col bg-background shadow-xl"
          >
            <div className="flex h-16 items-center justify-between border-b px-4 pr-2">
              <span className="font-semibold tracking-tight">Menu</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close navigation menu"
                onClick={() => setMobileOpen(false)}
              >
                <X />
              </Button>
            </div>
            <nav
              className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-4"
              aria-label="Mobile"
            >
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(linkClass, "block")}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="space-y-2 border-t p-4">
              <div className="flex justify-end">
                <ThemeToggle />
              </div>
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  buttonVariants({ variant: "outline", size: "default" }),
                  "w-full",
                )}
              >
                Sign in
              </Link>
              <Link
                href="/register"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  buttonVariants({ variant: "default", size: "default" }),
                  "w-full",
                )}
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
