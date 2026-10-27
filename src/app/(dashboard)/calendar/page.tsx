import Link from "next/link";
import { auth } from "@/auth";
import {
  buildMonthGrid,
  CALENDAR_EVENT_META,
  getCalendarEvents,
  groupEventsByDay,
  monthBounds,
  type CalendarEvent,
} from "@/lib/calendar-events";
import { manageablePropertyIds } from "@/lib/access";
import {
  currentMonthKey,
  formatDate,
  formatCurrency,
  isValidMonth,
  shiftMonth,
  todayInManila,
} from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MAX_CHIPS_PER_CELL = 3;

interface CalendarPageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const { month: monthRaw } = await searchParams;
  const month = monthRaw && isValidMonth(monthRaw) ? monthRaw : currentMonthKey();

  const session = await auth();
  const userId = session?.user?.id;
  // The dashboard layout redirects unauthenticated visitors.
  if (!userId) return null;

  const [events, manageableIds] = await Promise.all([
    getCalendarEvents(userId, month),
    manageablePropertyIds(userId),
  ]);
  const manageableSet = new Set(manageableIds);

  const { start } = monthBounds(month);
  const monthTitle = start.toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const isCurrentMonth = month === currentMonthKey();
  const today = todayInManila();

  const cells = buildMonthGrid(month);
  const byDay = groupEventsByDay(events);

  // The agenda needs each day's events in date order, not grid order.
  const agendaDays = [...byDay.entries()]
    .map(([key, dayEvents]) => ({ key, date: dayEvents[0].date, events: dayEvents }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">
            Rent due dates, move-ins and lease ends for {monthTitle}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            render={<Link href={`/calendar?month=${prevMonth}`} />}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            render={<Link href={`/calendar?month=${nextMonth}`} />}
          >
            <ChevronRight />
          </Button>
          {!isCurrentMonth && (
            <Button variant="ghost" render={<Link href="/calendar" />}>
              Today
            </Button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {(Object.keys(CALENDAR_EVENT_META) as Array<keyof typeof CALENDAR_EVENT_META>).map(
          (type) => (
            <span key={type} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={cn("size-2.5 rounded-full", CALENDAR_EVENT_META[type].dotClass)}
              />
              {CALENDAR_EVENT_META[type].label}
            </span>
          ),
        )}
      </div>

      {/* Month grid — full detail chips on md+, compact dots on phones where
          the agenda below carries the detail. */}
      <Card className="overflow-hidden py-0">
        <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-2">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            const dayEvents = date ? (byDay.get(dayKey(date)) ?? []) : [];
            const isToday = date !== null && date.getTime() === today.getTime();
            return (
              <div
                key={i}
                className={cn(
                  "min-h-16 border-b border-r border-border p-1.5 sm:min-h-24",
                  i % 7 === 6 && "border-r-0",
                  i >= cells.length - 7 && "border-b-0",
                  date === null && "bg-muted/30",
                )}
              >
                {date && (
                  <>
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full text-xs",
                        isToday
                          ? "bg-primary font-semibold text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {date.getUTCDate()}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dayEvents.slice(0, MAX_CHIPS_PER_CELL).map((e) => (
                        <CalendarChip key={e.leaseId + e.type} event={e} />
                      ))}
                      {dayEvents.length > MAX_CHIPS_PER_CELL && (
                        <p className="text-[10px] leading-3 text-muted-foreground">
                          +{dayEvents.length - MAX_CHIPS_PER_CELL} more
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Agenda — the same events as a list, with the lease link and the
          money. This is the part phones read. */}
      <Card>
        <CardHeader>
          <CardTitle>This month&apos;s events</CardTitle>
          <CardDescription>
            {events.length === 0
              ? "Nothing scheduled this month."
              : `${events.length} ${events.length === 1 ? "event" : "events"} in ${monthTitle}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agendaDays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No move-ins, lease ends or rent due dates in {monthTitle}. Use the
              arrows above to check another month.
            </p>
          ) : (
            <ol className="space-y-5">
              {agendaDays.map((day) => (
                <li key={day.key}>
                  <p className="text-sm font-semibold">{formatDate(day.date)}</p>
                  <ul className="mt-2 space-y-2">
                    {day.events.map((e) => (
                      <AgendaRow
                        key={e.leaseId + e.type}
                        event={e}
                        linked={manageableSet.has(e.propertyId)}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Key for an event's day cell, matching isoDate() without importing it. */
function dayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * One event inside a grid cell. Full label on md+ (there is room); on phones
 * just the coloured dot — the agenda below has the details.
 */
function CalendarChip({ event }: { event: CalendarEvent }) {
  const meta = CALENDAR_EVENT_META[event.type];
  return (
    <>
      {/* Phone: dot only */}
      <span className={cn("block size-2 rounded-full md:hidden", meta.dotClass)} />
      {/* md+: text chip */}
      <span
        className={cn(
          "hidden truncate rounded border px-1.5 py-0.5 text-[10px] leading-4 md:block",
          meta.chipClass,
        )}
      >
        {event.type === "rent_due" ? "Rent" : meta.label} · {event.tenantName}
      </span>
    </>
  );
}

function AgendaRow({
  event,
  linked,
}: {
  event: CalendarEvent;
  linked: boolean;
}) {
  const meta = CALENDAR_EVENT_META[event.type];
  const title =
    event.type === "rent_due"
      ? "Rent due"
      : event.type === "move_in"
        ? "Move-in"
        : "Lease ends";

  const paymentNote =
    event.type === "rent_due" && event.amount
      ? event.paidAmount && event.paidAmount >= event.amount
        ? ` · ${formatCurrency(event.paidAmount)} paid`
        : event.paidAmount && event.paidAmount > 0
          ? ` · ${formatCurrency(event.paidAmount)} of ${formatCurrency(event.amount)} paid`
          : ` · ${formatCurrency(event.amount)}`
      : "";

  const name = (
    <span className="font-medium">
      {title} — {event.tenantName}
    </span>
  );

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className={cn("size-2.5 shrink-0 rounded-full", meta.dotClass)} />
      {linked ? (
        <Link
          href={`/leases/${event.leaseId}/edit`}
          className="underline-offset-4 hover:underline"
        >
          {name}
        </Link>
      ) : (
        name
      )}
      <span className="text-muted-foreground">
        {event.unitName} · {event.propertyName}
        {paymentNote}
      </span>
    </li>
  );
}
