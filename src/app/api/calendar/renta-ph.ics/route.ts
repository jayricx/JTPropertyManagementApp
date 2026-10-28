import type { NextRequest } from "next/server";
import { todayInManila } from "@/lib/utils";
import { accessiblePropertyIdsAcrossPortfolios } from "@/lib/access";
import { getEventsForProperties } from "@/lib/calendar-events";
import { buildCalendarIcs, userForFeedToken } from "@/lib/calendar-feed";

/**
 * The lease-calendar ICS feed: /api/calendar/renta-ph.ics?token=<hex>
 *
 * Subscribed from a phone's calendar app (Google Calendar, iOS Calendar),
 * which polls this URL on its own schedule — so the token in the query string
 * is the whole authentication. Scoped across ALL of the user's portfolios,
 * not the active one: a calendar app has no session to pick a portfolio with.
 *
 * The window is roughly today minus a month to a year ahead — recent history
 * for context, everything scheduled ahead for planning.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const user = await userForFeedToken(token);

  if (!user) {
    return new Response("Unknown or missing feed token.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const today = todayInManila();
  const start = new Date(today.getTime() - 31 * 24 * 60 * 60 * 1000);
  const end = new Date(today.getTime() + 370 * 24 * 60 * 60 * 1000);

  const propertyIds = await accessiblePropertyIdsAcrossPortfolios(user.id);
  const events = await getEventsForProperties(propertyIds, start, end, {
    withPayments: false,
  });

  const ics = buildCalendarIcs({
    calendarName: `Renta-PH.net — ${user.name ?? "lease calendar"}`,
    events,
    now: new Date(),
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="renta-ph.ics"',
      // Calendar clients poll on their own schedule; never serve a cached copy.
      "Cache-Control": "private, no-store",
    },
  });
}
