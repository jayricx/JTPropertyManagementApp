"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2Icon, CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import {
  createPortfolioAction,
  setActivePortfolioAction,
  type ActionState,
} from "@/app/(dashboard)/portfolios/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PortfolioRole, PortfolioSummary } from "@/lib/portfolios";

const ROLE_LABELS: Record<PortfolioRole, string> = {
  owner: "Owner",
  co_owner: "Co-owner",
  viewer: "Viewer",
};

/**
 * The portfolio switcher. It renders **nothing** for an account with a single
 * portfolio — the concept stays invisible to a solo owner — and appears in the
 * nav only once there is genuinely a choice to make.
 */
export function PortfolioSwitcher({
  portfolios,
  activeId,
}: {
  portfolios: PortfolioSummary[];
  activeId: string | null;
}) {
  // Nothing to choose: a solo owner never sees the concept.
  if (portfolios.length < 2) return null;
  return (
    <SwitcherBody portfolios={portfolios} activeId={activeId} />
  );
}

function SwitcherBody({
  portfolios,
  activeId,
}: {
  portfolios: PortfolioSummary[];
  activeId: string | null;
}) {
  const active = portfolios.find((p) => p.id === activeId) ?? portfolios[0];
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <div className="border-b border-sidebar-border px-3 py-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => setOpen(true)}
          aria-label={`Switch portfolio — currently ${active.name}`}
        >
          <Building2Icon className="size-4 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate text-left text-sm">
            {active.name}
          </span>
          {active.role !== "owner" && (
            <span className="shrink-0 rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              {ROLE_LABELS[active.role]}
            </span>
          )}
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Switch portfolio</DialogTitle>
            <DialogDescription>
              Everything you see — properties, tenants, leases and fields —
              belongs to the portfolio in view.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1">
            {portfolios.map((p) => (
              <PortfolioChoice
                key={p.id}
                portfolio={p}
                active={p.id === active.id}
                onChosen={() => setOpen(false)}
              />
            ))}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
            >
              <PlusIcon />
              New portfolio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreatePortfolioDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function PortfolioChoice({
  portfolio,
  active,
  onChosen,
}: {
  portfolio: PortfolioSummary;
  active: boolean;
  onChosen: () => void;
}) {
  const router = useRouter();
  const [, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await setActivePortfolioAction(prev, formData);
      onChosen();
      router.refresh();
      return result;
    },
    null,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="portfolioId" value={portfolio.id} />
      <Button
        type="submit"
        variant="ghost"
        disabled={pending}
        className="w-full justify-start gap-2"
      >
        <Building2Icon className="size-4 shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate text-left">
          {portfolio.name}
          <span className="ml-2 text-xs text-muted-foreground">
            {portfolio.propertyCount} propert
            {portfolio.propertyCount === 1 ? "y" : "ies"}
          </span>
        </span>
        {portfolio.role !== "owner" && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {ROLE_LABELS[portfolio.role]}
          </span>
        )}
        {active && <CheckIcon className="size-4 shrink-0" />}
      </Button>
    </form>
  );
}

function CreatePortfolioDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createPortfolioAction,
    null,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New portfolio</DialogTitle>
          <DialogDescription>
            A portfolio holds a set of properties, tenants and custom fields
            that you manage together.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="portfolio-name">Name</Label>
            <Input
              id="portfolio-name"
              name="name"
              placeholder="e.g. Malate rentals"
              required
            />
          </div>
          {state?.error && (
            <p className="text-sm font-medium text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create portfolio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}