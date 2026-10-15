"use client";

import { usePathname, useRouter } from "next/navigation";
import { Building2Icon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { propertyFilterLabel, serializePropertySelection } from "@/lib/property-filter";

interface PropertyOption {
  id: string;
  name: string;
}

interface PropertyFilterProps {
  /** Every property the user can access (the full selectable set). */
  options: PropertyOption[];
  /** `null` = no filter (all properties); `[]` = nothing selected. */
  selected: string[] | null;
  /** Extra query params preserved across filter changes (e.g. `months`). */
  keepParams?: Record<string, string>;
  /** Accessible name for the trigger button. */
  ariaLabel?: string;
  /** Trigger text when nothing is selected. */
  noneLabel?: string;
}

/**
 * Multi-select property filter shared by Reports and Finance. Selections
 * live in the URL (`?properties=`) so they survive reloads, other filters,
 * CSV downloads, and sharing. "Select all" drops the param entirely (that is
 * the canonical unfiltered URL); "Deselect all" writes the `none` sentinel
 * so the empty selection is a real, shareable state.
 */
export function PropertyFilter({
  options,
  selected,
  keepParams,
  ariaLabel = "Filter by properties",
  noneLabel = "None selected",
}: PropertyFilterProps) {
  const router = useRouter();
  const pathname = usePathname();

  if (options.length === 0) return null;

  // When unfiltered, everything is checked; otherwise only the selection.
  const checked = new Set(selected ?? options.map((o) => o.id));

  function apply(ids: string[]) {
    const unique = ids.filter((id) => options.some((o) => o.id === id));
    const params = new URLSearchParams(keepParams);
    const value = serializePropertySelection(unique, options.length);
    if (value) params.set("properties", value);
    // The menu covers the top of the page — don't jump back up on push.
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply([...next]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" aria-label={ariaLabel} />
        }
      >
        <Building2Icon />
        <span className="max-w-44 truncate">
          {propertyFilterLabel(selected, options, noneLabel)}
        </span>
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56 max-w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Properties</DropdownMenuLabel>
        </DropdownMenuGroup>
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.id}
            checked={checked.has(o.id)}
            // Stay open so several properties can be picked in one go.
            closeOnClick={false}
            onCheckedChange={() => toggle(o.id)}
          >
            <span className="truncate">{o.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        {/* Base UI fires `onClick` on menu items — Radix's `onSelect` is a
            valid-but-ignored `div` attribute, which silently broke the
            previous "All properties" reset action. */}
        <DropdownMenuItem onClick={() => apply(options.map((o) => o.id))}>
          Select all
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => apply([])}>
          Deselect all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}