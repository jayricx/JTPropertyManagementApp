"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Building2,
  ChartColumnBig,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/tenants", label: "Tenants", icon: Users },
  { href: "/leases", label: "Leases", icon: FileText },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/reports", label: "Reports", icon: ChartColumnBig },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({
  pathname,
  hasPortal = false,
  onNavigate,
}: {
  pathname: string;
  hasPortal?: boolean;
  onNavigate?: () => void;
}) {
  const isItemActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isItemActive(item.href)
              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_0_var(--sidebar-primary)]"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
      {/* Owners who also rent from another owner can jump to the portal. */}
      {hasPortal && (
        <Link
          href="/portal"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isItemActive("/portal")
              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_0_var(--sidebar-primary)]"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <Home className="h-4 w-4" />
          Tenant portal
        </Link>
      )}
    </>
  );
}

function NavSignOut({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.();
        signOut({ callbackUrl: "/login" });
      }}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </button>
  );
}

/** Sidebar footer — theme switch next to sign out, both on the green surface. */
function SidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex items-center gap-1 border-t border-sidebar-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <ThemeToggle className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
      <NavSignOut onNavigate={onNavigate} />
    </div>
  );
}

/** `tone="surface"` is for light surfaces (mobile header); the default
    assumes the deep-green sidebar it usually sits in. */
function NavBrand({
  compact = false,
  tone = "sidebar",
}: {
  compact?: boolean;
  tone?: "sidebar" | "surface";
}) {
  return (
    <Link
      href="/dashboard"
      className={cn(
        "flex min-w-0 items-center gap-2 font-semibold",
        tone === "sidebar" ? "text-sidebar-foreground" : "text-foreground",
      )}
    >
      <Image
        src="/icon.svg"
        alt=""
        width={compact ? 24 : 26}
        height={compact ? 24 : 26}
        priority
      />
      <span className="truncate">RentBase-PH</span>
    </Link>
  );
}

export function DashboardNav({
  hasPortal = false,
  children,
}: {
  hasPortal?: boolean;
  /** Rendered under the brand in the sidebar (the portfolio switcher). */
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Lock background scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-16 items-center border-b border-sidebar-border px-6">
          <NavBrand />
        </div>
        {children}
        <nav className="flex-1 space-y-1 p-4">
          <NavLinks pathname={pathname} hasPortal={hasPortal} />
        </nav>
        <SidebarFooter />
      </aside>

      {/* Mobile header — the sidebar is hidden below md, so this is the only
          way to reach the navigation on small screens. */}
      <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4 pt-[env(safe-area-inset-top)] md:hidden"
        style={{ height: "calc(4rem + env(safe-area-inset-top))" }}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Menu />
        </Button>
        <NavBrand compact tone="surface" />
        <ThemeToggle className="ml-auto" />
      </header>

      {/* Mobile drawer */}
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
            className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl"
          >
            <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4 pr-2 pt-[env(safe-area-inset-top)]">
              <NavBrand />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close navigation menu"
                onClick={() => setMobileOpen(false)}
                className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <X />
              </Button>
            </div>
            {children}
            <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-4">
              <NavLinks
                pathname={pathname}
                hasPortal={hasPortal}
                onNavigate={() => setMobileOpen(false)}
              />
            </nav>
            <SidebarFooter onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
