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

interface PropertyOption {
  id: string;
  name: string;
}

interface ReportPropertyFilterProps {
  /** Every property the user can access (the full selectable set). */
  options: PropertyOption[];
  /** Selected property ids, or null when the report is unfiltered. */
  selected: string[] | null;
  months: number;
}

/**
 * Multi-select property filter for the reports header. Selections are kept
 * in the URL (`?properties=id1,id2`) alongside `?months=` so the filter
 * survives period switches, CSV downloads, and sharing. Selecting every
 * property (or none) is equivalent to no filter, so the URL stays canonical.
 */
export function ReportPropertyFilter({
  options,
  selected,
  months,
}: ReportPropertyFilterProps) {
  const router = useRouter();
  const pathname = usePathname();

  if (options.length === 0) return null;

  // When unfiltered, everything is checked; otherwise only the selection.
  const checked = new Set(selected ?? options.map((o) => o.id));

  function apply(ids: string[]) {
    const unique = ids.filter((id) => options.some((o) => o.id === id));
    const params = new URLSearchParams();
    params.set("months", String(months));
    if (unique.length > 0 && unique.length < options.length) {
      params.set("properties", unique.join(","));
    }
    // The menu covers the top of the page — don't jump back up on push.
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply([...next]);
  }

  const label =
    selected === null
      ? "All properties"
      : selected.length === 1
        ? (options.find((o) => o.id === selected[0])?.name ?? "1 property")
        : `${selected.length} properties`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label="Filter report by properties"
          />
        }
      >
        <Building2Icon />
        <span className="max-w-44 truncate">{label}</span>
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-auto min-w-56 max-w-80"
      >
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
        <DropdownMenuItem onSelect={() => apply([])}>
          All properties
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
