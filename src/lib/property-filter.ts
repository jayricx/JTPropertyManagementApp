/**
 * Property multi-select filter shared by the Reports and Finance pages.
 *
 * URL grammar (`?properties=`):
 *   absent        → no filter: every accessible property
 *   `none`        → "Deselect all": an explicit empty selection
 *   `id1,id2,…`   → exactly those properties
 *
 * The `none` sentinel exists because an empty selection used to be
 * indistinguishable from "no filter" — the dropdown's "Deselect all"
 * button had nowhere to write its state and silently snapped back to
 * everything.
 */

/** Sentinel written to `?properties=` when nothing is selected. */
export const NO_PROPERTIES_SELECTED = "none";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILTER_PROPERTIES = 200;

/**
 * Parse a `?properties=` value into a filter list.
 *
 * Returns `null` when no usable value is present (meaning "no filter") and
 * `[]` for the explicit "nothing selected" sentinel.
 */
export function normalizePropertyFilter(
  raw: string | null | undefined,
): string[] | null {
  if (!raw) return null;
  if (raw === NO_PROPERTIES_SELECTED) return [];
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => UUID_RE.test(s)),
    ),
  ];
  return ids.length ? ids.slice(0, MAX_FILTER_PROPERTIES) : null;
}

/**
 * Intersect a requested selection with the properties the user can actually
 * reach, and collapse "everything selected" back to `null` so the URL stays
 * canonical. Returns `null` for no filter or `[]` for an explicit empty
 * selection.
 */
export function sanitizePropertySelection(
  requested: string[] | null,
  optionIds: string[],
): string[] | null {
  if (requested === null) return null;
  const allowed = new Set(optionIds);
  const usable = requested.filter((id) => allowed.has(id));
  // Every accessible property selected ≡ no filter.
  if (usable.length > 0 && usable.length === optionIds.length) return null;
  return usable;
}

/**
 * Serialize a selection into a `?properties=` value, or `null` when the
 * param should be omitted (everything selected).
 */
export function serializePropertySelection(
  selected: string[],
  optionCount: number,
): string | null {
  if (selected.length === 0) return NO_PROPERTIES_SELECTED;
  if (selected.length >= optionCount) return null;
  return selected.join(",");
}

/** Trigger-button text for a selection. */
export function propertyFilterLabel(
  selected: string[] | null,
  options: { id: string; name: string }[],
  noneLabel = "None selected",
): string {
  if (selected === null) return "All properties";
  if (selected.length === 0) return noneLabel;
  if (selected.length === 1) {
    return options.find((o) => o.id === selected[0])?.name ?? "1 property";
  }
  return `${selected.length} properties`;
}