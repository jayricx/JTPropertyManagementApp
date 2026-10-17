"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { LayoutDashboard, LogOutIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * `showDashboardLink` is set for accounts that are also owners, so they can
 * hop back to their landlord dashboard from the portal.
 */
export function PortalHeader({
  showDashboardLink = false,
}: {
  showDashboardLink?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div
        className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)]"
        style={{ height: "calc(3.5rem + env(safe-area-inset-top))" }}
      >
        <Link
          href="/portal"
          className="flex min-w-0 items-center gap-2 font-semibold"
        >
          <Image src="/icon.svg" alt="" width={24} height={24} priority />
          <span className="truncate">RentBase-PH</span>
          <span className="hidden rounded border px-1.5 py-0.5 text-xs font-normal text-muted-foreground sm:inline">
            Tenant portal
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          {showDashboardLink && (
            <Link
              href="/dashboard"
              className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          )}
          <ThemeToggle />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOutIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
