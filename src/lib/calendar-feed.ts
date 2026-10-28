/**
 * The lease-calendar ICS feed.
 *
 * A landlord's phone calendar (Google Calendar "subscribe from URL", or any
 * app that speaks iCalendar) re-polls a single URL on its own schedule. That
 * client can never send auth headers or handle an interactive sign-in, so the
 * feed authenticates with a per-landlord token in the query string — the same
 * trade private calendar feeds always make, which is why the token is
 * regenerable from Settings to cut off a leaked link.
 *
 * Everything here follows RFC 5545: text escaping and 75-octet line folding.
 * Parsers like Google's are forgiving, but a feed that validates strictly is
 * one that works everywhere.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { isoDate } from "@/lib/billing-periods";
import type { CalendarEvent } from "@/lib/calendar-events";

/** 48 hex chars — URL-safe and far beyond brute-force range. */
export function newFeedToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * The user's feed token, minting one on first use. Tokens are backfilled for
 * existing accounts by migration; lazily minting covers anyone created since.
 */
export async function ensureFeedToken(userId: string): Promise<string> {
  const [row] = await db
    .select({ token: users.calendarFeedToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (row?.token) return row.token;

  const token = newFeedToken();
  await db
    .update(users)
    .set({ calendarFeedToken: token })
    .where(eq(users.id, userId));
  return token;
}

/** The landlord a feed token belongs to, or null when the token is unknown. */
export async function userForFeedToken(
  token: string | null,
): Promise<{ id: string; name: string | null } | null> {
  if (!token || !/^[0-9a-f]{32,64}$/.test(token)) return null;
  const [row] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.calendarFeedToken, token))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// ICS text rules
// ---------------------------------------------------------------------------

/** RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, comma, newlines. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line to 75 octets (§3.1): continuation lines begin with a
 * single space. Folding counts octets, not characters, so a ₱ sign or a
 * Filipino name with a diacritic must never be split mid-character — the
 * walk moves back to a code-point boundary.
 */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let rest = bytes;
  while (rest.length > 75) {
    // First segment fits 75 octets; continuations fit 74 (one octet is the
    // leading space of the continuation).
    const limit = parts.length === 0 ? 75 : 74;
    let cut = limit;
    while (cut > 0 && (rest[cut] & 0xc0) === 0x80) cut -= 1; // inside a multibyte char
    parts.push(rest.subarray(0, cut).toString("utf8"));
    rest = rest.subarray(cut);
  }
  parts.push(rest.toString("utf8"));
  return parts.join("\r\n ");
}

/** UTC timestamp in the basic format iCalendar requires: 20261114T083000Z. */
function icsDateTimeUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** "20261114" — an all-day VALUE=DATE, as the stored day is meant to read. */
function icsDate(date: Date): string {
  return isoDate(date).replace(/-/g, "");
}

function eventSummary(event: CalendarEvent): string {
  const where = `${event.unitName} · ${event.propertyName}`;
  switch (event.type) {
    case "rent_due":
      return `Rent due — ${event.tenantName} (${where})`;
    case "move_in":
      return `Move-in — ${event.tenantName} (${where})`;
    case "lease_end":
      return `Lease ends — ${event.tenantName} (${where})`;
  }
}

function eventDescription(event: CalendarEvent): string {
  switch (event.type) {
    case "rent_due": {
      const collected =
        event.amount && event.paidAmount && event.paidAmount > 0
          ? ` Collected so far: PHP ${event.paidAmount.toFixed(2)} of PHP ${event.amount.toFixed(2)}.`
          : ` Rent: PHP ${(event.amount ?? 0).toFixed(2)}.`;
      return `Rent for ${event.tenantName} — ${event.unitName} · ${event.propertyName} — falls due (this billing period starts today).${collected} Open the lease: /leases/${event.leaseId}`;
    }
    case "move_in":
      return `${event.tenantName} moves into ${event.unitName} · ${event.propertyName}. Lease: /leases/${event.leaseId}`;
    case "lease_end":
      return `The lease for ${event.tenantName} — ${event.unitName} · ${event.propertyName} — ends today. Decide on renewal or move-out.`;
  }
}

/** Sort so the feed reads sensibly when inspected by hand. */
function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  return (
    a.date.getTime() - b.date.getTime() ||
    a.tenantName.localeCompare(b.tenantName)
  );
}

/**
 * The full VCALENDAR document. UIDs are stable per (lease, day, type), so
 * re-polling updates existing events instead of duplicating them.
 */
export function buildCalendarIcs(options: {
  calendarName: string;
  events: CalendarEvent[];
  now: Date;
}): string {
  const { calendarName, events, now } = options;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Renta-PH.net//Lease Calendar 1.0//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    // The app's own timezone; clients use it to render date-only events.
    "X-WR-TIMEZONE:Asia/Manila",
    // Google re-polls on its own clock; this asks for twice a day.
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];

  const dtstamp = icsDateTimeUtc(now);
  for (const event of [...events].sort(compareEvents)) {
    const start = event.date;
    // All-day events end at the next midnight, exclusive (§3.6.1).
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:renta-ph-${event.type}-${event.leaseId}-${icsDate(start)}@renta-ph.net`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(end)}`,
      `SUMMARY:${escapeText(eventSummary(event))}`,
      `DESCRIPTION:${escapeText(eventDescription(event))}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
