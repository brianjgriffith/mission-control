"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  type CalendarEvent,
  type EventType,
  EVENT_TYPE_CONFIG,
} from "@/lib/types";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  CalendarDays,
  Grid3X3,
} from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  eachDayOfInterval,
  format,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  differenceInDays,
  isBefore,
  isAfter,
  addDays,
  startOfYear,
  endOfYear,
  setMonth as dateFnsSetMonth,
  getYear,
} from "date-fns";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_LANES = 3;
const BAR_HEIGHT = 20;
const BAR_GAP = 2;
const DAY_NUMBER_HEIGHT = 28;
const EVENT_TYPES: EventType[] = [
  "mastermind",
  "sabbath",
  "vacation",
  "challenge",
  "holiday",
  "deadline",
  "custom",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the display color for an event: use color override if set, else type default. */
function getEventColor(event: CalendarEvent): string {
  if (event.color && event.color.length > 0) return event.color;
  return EVENT_TYPE_CONFIG[event.event_type]?.color ?? "#6366f1";
}

/** Get the effective end Date for an event (falls back to start_date for single-day). */
function getEventEnd(event: CalendarEvent): Date {
  return event.end_date ? parseISO(event.end_date) : parseISO(event.start_date);
}

/** True if the event spans more than one day. */
function isMultiDay(event: CalendarEvent): boolean {
  return !!event.end_date && event.end_date !== event.start_date;
}

/** True if an event overlaps with [intervalStart, intervalEnd] (all inclusive). */
function eventOverlapsInterval(
  event: CalendarEvent,
  intervalStart: Date,
  intervalEnd: Date
): boolean {
  const evStart = parseISO(event.start_date);
  const evEnd = getEventEnd(event);
  return (
    (isBefore(evStart, intervalEnd) || isSameDay(evStart, intervalEnd)) &&
    (isAfter(evEnd, intervalStart) || isSameDay(evEnd, intervalStart))
  );
}

/** Duration of an event in calendar days (inclusive). */
function eventDuration(event: CalendarEvent): number {
  return differenceInDays(getEventEnd(event), parseISO(event.start_date)) + 1;
}

// ---------------------------------------------------------------------------
// Multi-day bar layout algorithm
// ---------------------------------------------------------------------------

interface BarSegment {
  event: CalendarEvent;
  lane: number; // vertical slot index within the week row (0-based)
  colStart: number; // 0-6 day-of-week column where this bar segment starts
  colSpan: number; // number of columns this bar segment spans
  startsInWeek: boolean; // true if the event's real start falls in this week
  endsInWeek: boolean; // true if the event's real end falls in this week
}

/**
 * Assign non-overlapping horizontal lanes to multi-day events within a week.
 *
 * Events are sorted longest-first (then by start date) so that wider bars
 * get priority for lower lane numbers, matching Google Calendar behavior.
 */
function assignLanes(
  events: CalendarEvent[],
  weekStart: Date,
  weekEnd: Date
): BarSegment[] {
  const sorted = [...events].sort((a, b) => {
    const durDiff = eventDuration(b) - eventDuration(a);
    if (durDiff !== 0) return durDiff;
    return a.start_date.localeCompare(b.start_date);
  });

  // Each lane is a Set of occupied column indices (0-6)
  const lanes: Set<number>[] = [];
  const segments: BarSegment[] = [];

  for (const event of sorted) {
    const evStart = parseISO(event.start_date);
    const evEnd = getEventEnd(event);

    // Clamp to the visible week boundaries
    const clampedStart = isBefore(evStart, weekStart) ? weekStart : evStart;
    const clampedEnd = isAfter(evEnd, weekEnd) ? weekEnd : evEnd;

    const colStart = clampedStart.getDay(); // 0=Sun ... 6=Sat
    const colEnd = clampedEnd.getDay();
    const colSpan = colEnd - colStart + 1;

    // Columns this bar needs
    const neededCols: number[] = [];
    for (let c = colStart; c <= colEnd; c++) {
      neededCols.push(c);
    }

    // Find first lane with no column conflict
    let assignedLane = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (!neededCols.some((c) => lanes[i].has(c))) {
        assignedLane = i;
        break;
      }
    }
    if (assignedLane === -1) {
      assignedLane = lanes.length;
      lanes.push(new Set());
    }

    // Reserve columns in the lane
    for (const c of neededCols) {
      lanes[assignedLane].add(c);
    }

    // startsInWeek = event start was NOT clamped (it genuinely starts this week)
    // endsInWeek   = event end was NOT clamped (it genuinely ends this week)
    segments.push({
      event,
      lane: assignedLane,
      colStart,
      colSpan,
      startsInWeek: !isBefore(evStart, weekStart),
      endsInWeek: !isAfter(evEnd, weekEnd),
    });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Per-week layout: multi-day bars + single-day events bucketed by column
// ---------------------------------------------------------------------------

interface WeekLayout {
  bars: BarSegment[];
  singleDayByCol: CalendarEvent[][];
  totalLanes: number; // max lane index + 1, or 0 if no bars
}

function computeWeekLayout(
  week: Date[],
  events: CalendarEvent[]
): WeekLayout {
  const weekStart = week[0];
  const weekEnd = week[6];

  // Separate multi-day and single-day events
  const multiDayEvents = events.filter(
    (ev) => isMultiDay(ev) && eventOverlapsInterval(ev, weekStart, weekEnd)
  );

  const singleDayByCol: CalendarEvent[][] = Array.from(
    { length: 7 },
    () => []
  );
  for (const ev of events) {
    if (isMultiDay(ev)) continue;
    const evDate = parseISO(ev.start_date);
    for (let col = 0; col < 7; col++) {
      if (isSameDay(evDate, week[col])) {
        singleDayByCol[col].push(ev);
        break;
      }
    }
  }

  const bars = assignLanes(multiDayEvents, weekStart, weekEnd);
  const totalLanes =
    bars.length > 0 ? Math.max(...bars.map((b) => b.lane)) + 1 : 0;

  return { bars, singleDayByCol, totalLanes };
}

// ---------------------------------------------------------------------------
// EventDialog -- create / edit / delete calendar events
// ---------------------------------------------------------------------------

interface EventDialogProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  event: CalendarEvent | null;
  prefillDate: string | null;
  onSuccess: () => void;
}

function EventDialog({
  open,
  onClose,
  mode,
  event,
  prefillDate,
  onSuccess,
}: EventDialogProps) {
  const projects = useStore((s) => s.projects);

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [eventType, setEventType] = useState<EventType>("custom");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Populate form when dialog opens or switches between events
  useEffect(() => {
    if (!open) {
      setConfirmDelete(false);
      return;
    }
    if (mode === "edit" && event) {
      setTitle(event.title);
      setStartDate(event.start_date);
      setEndDate(event.end_date ?? "");
      setEventType(event.event_type);
      setDescription(event.description ?? "");
      setProjectId(event.project_id ?? "");
    } else {
      setTitle("");
      setStartDate(prefillDate ?? format(new Date(), "yyyy-MM-dd"));
      setEndDate("");
      setEventType("custom");
      setDescription("");
      setProjectId("");
    }
    setConfirmDelete(false);
  }, [open, mode, event, prefillDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDate) return;

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        start_date: startDate,
        end_date: endDate || null,
        event_type: eventType,
        description: description.trim(),
        project_id: projectId || null,
        color: "",
        all_day: true,
      };

      if (mode === "create") {
        const res = await fetch("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to create event");
      } else if (mode === "edit" && event) {
        const res = await fetch(`/api/calendar/${event.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to update event");
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error("[EventDialog] save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/calendar/${event.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete event");
      onSuccess();
      onClose();
    } catch (err) {
      console.error("[EventDialog] delete error:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">
            {mode === "create" ? "New Event" : "Edit Event"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="text-sm"
              autoFocus
              required
            />
          </div>

          {/* Start / End Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Start Date
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                End Date
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-sm"
                min={startDate}
              />
            </div>
          </div>

          {/* Event Type selector with colored dots */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Event Type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_TYPES.map((type) => {
                const cfg = EVENT_TYPE_CONFIG[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEventType(type)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                      eventType === type
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground/60 hover:bg-secondary/50"
                    )}
                  >
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: cfg.color }}
                    />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes..."
              className="min-h-[60px] resize-none text-sm"
            />
          </div>

          {/* Project link */}
          {projects.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Project
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
              >
                <option value="">None</option>
                {projects
                  .filter((p) => p.status === "active")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between">
            <div>
              {mode === "edit" && (
                <Button
                  type="button"
                  variant={confirmDelete ? "destructive" : "ghost"}
                  size="sm"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  {confirmDelete ? "Confirm Delete" : "Delete"}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!title.trim() || !startDate || saving}
              >
                {saving
                  ? "Saving..."
                  : mode === "create"
                  ? "Create Event"
                  : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// WeekRow -- renders one week (7 day cells + absolutely-positioned bars)
// ---------------------------------------------------------------------------

interface WeekRowProps {
  week: Date[];
  weekIdx: number;
  layout: WeekLayout;
  currentMonth: Date;
  onDayClick: (day: Date) => void;
  onEventClick: (event: CalendarEvent, e: React.MouseEvent) => void;
}

function WeekRow({
  week,
  weekIdx,
  layout,
  currentMonth,
  onDayClick,
  onEventClick,
}: WeekRowProps) {
  const visibleLanes = Math.min(layout.totalLanes, MAX_VISIBLE_LANES);
  const barAreaHeight = visibleLanes * (BAR_HEIGHT + BAR_GAP);
  const rowMinHeight = DAY_NUMBER_HEIGHT + barAreaHeight + 30;

  return (
    <div
      className="relative border-b border-border/20"
      style={{ minHeight: Math.max(rowMinHeight, 120) }}
    >
      {/* Background: 7 day cells */}
      <div className="grid h-full grid-cols-7">
        {week.map((day, colIdx) => {
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);

          // How many multi-day bar lanes occupy this column?
          const barsInCell = layout.bars.filter(
            (b) => colIdx >= b.colStart && colIdx < b.colStart + b.colSpan
          );
          const visibleBarsInCell = barsInCell.filter(
            (b) => b.lane < MAX_VISIBLE_LANES
          );
          const hiddenBars = barsInCell.length - visibleBarsInCell.length;

          // Single-day events for this day
          const singles = layout.singleDayByCol[colIdx];
          const singleSlots = Math.max(
            0,
            MAX_VISIBLE_LANES - visibleBarsInCell.length
          );
          const visibleSingles = singles.slice(0, singleSlots);
          const hiddenSingles = singles.length - visibleSingles.length;
          const overflow = hiddenBars + hiddenSingles;

          return (
            <div
              key={colIdx}
              className={cn(
                "flex flex-col border-r border-border/20 last:border-r-0 cursor-pointer transition-colors hover:bg-card/30",
                !inMonth && "opacity-40"
              )}
              onClick={() => onDayClick(day)}
            >
              {/* Day number */}
              <div
                className="flex justify-end px-2 pt-1"
                style={{ height: DAY_NUMBER_HEIGHT }}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    today
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>

              {/* Spacer reserving vertical room for absolutely-positioned bars */}
              <div style={{ height: barAreaHeight }} />

              {/* Single-day event pills */}
              <div className="flex flex-col gap-0.5 px-1 pb-1">
                {visibleSingles.map((ev) => {
                  const color = getEventColor(ev);
                  return (
                    <button
                      key={ev.id}
                      className="flex w-full items-center rounded px-1.5 py-0.5 text-left text-[10px] leading-tight text-white/90 transition-opacity hover:opacity-80"
                      style={{ backgroundColor: color + "cc" }}
                      onClick={(e) => onEventClick(ev, e)}
                      title={ev.title}
                    >
                      <span className="truncate">{ev.title}</span>
                    </button>
                  );
                })}

                {overflow > 0 && (
                  <span className="px-1.5 text-[10px] text-muted-foreground">
                    +{overflow} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Multi-day bar segments, absolutely positioned across the full row width */}
      {layout.bars
        .filter((bar) => bar.lane < MAX_VISIBLE_LANES)
        .map((bar) => {
          const color = getEventColor(bar.event);
          const cellPct = 100 / 7;
          const leftPct = bar.colStart * cellPct;
          const widthPct = bar.colSpan * cellPct;
          const topPx = DAY_NUMBER_HEIGHT + bar.lane * (BAR_HEIGHT + BAR_GAP);

          return (
            <div
              key={`${bar.event.id}-w${weekIdx}`}
              className={cn(
                "absolute z-10 flex items-center overflow-hidden cursor-pointer transition-opacity hover:opacity-80",
                bar.startsInWeek ? "rounded-l-[4px]" : "rounded-l-none",
                bar.endsInWeek ? "rounded-r-[4px]" : "rounded-r-none"
              )}
              style={{
                left: `calc(${leftPct}% + 2px)`,
                width: `calc(${widthPct}% - 4px)`,
                top: topPx,
                height: BAR_HEIGHT,
                backgroundColor: color + "cc",
              }}
              onClick={(e) => onEventClick(bar.event, e)}
              title={bar.event.title}
            >
              <span className="truncate px-2 text-[10px] font-medium text-white/90">
                {bar.startsInWeek ? bar.event.title : ""}
              </span>
            </div>
          );
        })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Year overview -- compact 12-month grid
// ---------------------------------------------------------------------------

type CalendarViewMode = "month" | "year";

const MINI_DAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

function YearOverview({
  year,
  events,
  onMonthClick,
}: {
  year: number;
  events: CalendarEvent[];
  onMonthClick: (monthDate: Date) => void;
}) {
  return (
    <div className="grid flex-1 grid-cols-4 gap-4 overflow-auto p-6">
      {Array.from({ length: 12 }, (_, monthIdx) => {
        const monthDate = dateFnsSetMonth(new Date(year, 0, 1), monthIdx);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
        const gridEnd = addDays(gridStart, 41);
        const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

        // Events in this month
        const monthEvents = events.filter((ev) =>
          eventOverlapsInterval(ev, monthStart, monthEnd)
        );

        // Build a map: dateString -> event colors for that day
        const dayColors: Record<string, string[]> = {};
        for (const ev of monthEvents) {
          const evStart = parseISO(ev.start_date);
          const evEnd = getEventEnd(ev);
          const rangeStart = isBefore(evStart, monthStart) ? monthStart : evStart;
          const rangeEnd = isAfter(evEnd, monthEnd) ? monthEnd : evEnd;
          const rangeDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
          const color = getEventColor(ev);
          for (const d of rangeDays) {
            const key = format(d, "yyyy-MM-dd");
            if (!dayColors[key]) dayColors[key] = [];
            if (!dayColors[key].includes(color)) dayColors[key].push(color);
          }
        }

        const isCurrentMonth = isSameMonth(monthDate, new Date());

        return (
          <button
            key={monthIdx}
            onClick={() => onMonthClick(monthDate)}
            className={cn(
              "rounded-lg border border-border/30 bg-card/20 p-3 text-left transition-colors hover:bg-card/40",
              isCurrentMonth && "ring-1 ring-primary/40"
            )}
          >
            <p className="mb-2 text-xs font-semibold">
              {format(monthDate, "MMMM")}
            </p>
            {/* Day-of-week headers */}
            <div className="mb-0.5 grid grid-cols-7 gap-px">
              {MINI_DAY_HEADERS.map((d, i) => (
                <div
                  key={i}
                  className="text-center text-[8px] text-muted-foreground/40"
                >
                  {d}
                </div>
              ))}
            </div>
            {/* Day grid */}
            <div className="grid grid-cols-7 gap-px">
              {days.map((day, dayIdx) => {
                const inMonth = isSameMonth(day, monthDate);
                const dateKey = format(day, "yyyy-MM-dd");
                const colors = dayColors[dateKey];
                const today = isToday(day);

                return (
                  <div
                    key={dayIdx}
                    className={cn(
                      "flex flex-col items-center py-0.5",
                      !inMonth && "opacity-20"
                    )}
                  >
                    <span
                      className={cn(
                        "text-[9px] leading-none",
                        today
                          ? "flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground"
                          : "text-muted-foreground/60"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {colors && colors.length > 0 && inMonth && (
                      <div className="mt-0.5 flex gap-px">
                        {colors.slice(0, 3).map((c, ci) => (
                          <div
                            key={ci}
                            className="h-1 w-1 rounded-full"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CalendarView -- main exported component
// ---------------------------------------------------------------------------

export function CalendarView() {
  const projects = useStore((s) => s.projects);

  // View mode: month or year
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");

  // Current month being viewed
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // Year view state
  const [yearViewYear, setYearViewYear] = useState(getYear(new Date()));
  const [yearEvents, setYearEvents] = useState<CalendarEvent[]>([]);

  // Event dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogEvent, setDialogEvent] = useState<CalendarEvent | null>(null);
  const [dialogPrefillDate, setDialogPrefillDate] = useState<string | null>(
    null
  );

  // Compute the 6-week (42-day) grid boundaries
  const gridRange = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = addDays(gridStart, 41); // 42 days total
    return { monthStart, monthEnd, gridStart, gridEnd };
  }, [currentMonth]);

  // Generate all 42 days in the grid
  const gridDays = useMemo(
    () =>
      eachDayOfInterval({
        start: gridRange.gridStart,
        end: gridRange.gridEnd,
      }),
    [gridRange]
  );

  // Split into 6 week rows of 7 days each
  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < gridDays.length; i += 7) {
      result.push(gridDays.slice(i, i + 7));
    }
    return result;
  }, [gridDays]);

  // Fetch events covering the visible grid range
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const startStr = format(gridRange.gridStart, "yyyy-MM-dd");
      const endStr = format(gridRange.gridEnd, "yyyy-MM-dd");
      const res = await fetch(
        `/api/calendar?start=${startStr}&end=${endStr}`
      );
      if (!res.ok) throw new Error("Failed to fetch events");
      const json = await res.json();
      setEvents(json.events ?? []);
    } catch (err) {
      console.error("[CalendarView] fetch error:", err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [gridRange.gridStart, gridRange.gridEnd]);

  // Re-fetch when the visible range changes
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Fetch year events for year overview
  const fetchYearEvents = useCallback(async () => {
    try {
      const ys = startOfYear(new Date(yearViewYear, 0, 1));
      const ye = endOfYear(ys);
      const res = await fetch(
        `/api/calendar?start=${format(ys, "yyyy-MM-dd")}&end=${format(ye, "yyyy-MM-dd")}`
      );
      if (!res.ok) return;
      const json = await res.json();
      setYearEvents(json.events ?? []);
    } catch (err) {
      console.error("[CalendarView] year fetch:", err);
    }
  }, [yearViewYear]);

  useEffect(() => {
    if (viewMode === "year") fetchYearEvents();
  }, [viewMode, fetchYearEvents]);

  // Pre-compute bar + event layout for every week row
  const weekLayouts = useMemo(
    () => weeks.map((week) => computeWeekLayout(week, events)),
    [weeks, events]
  );

  // Month navigation
  const goToPrevMonth = () => setCurrentMonth((m) => subMonths(m, 1));
  const goToNextMonth = () => setCurrentMonth((m) => addMonths(m, 1));
  const goToToday = () => setCurrentMonth(new Date());

  // Open dialog to create a new event on a specific day
  const handleDayClick = useCallback((day: Date) => {
    setDialogMode("create");
    setDialogEvent(null);
    setDialogPrefillDate(format(day, "yyyy-MM-dd"));
    setDialogOpen(true);
  }, []);

  // Open dialog to edit an existing event
  const handleEventClick = useCallback(
    (event: CalendarEvent, e: React.MouseEvent) => {
      e.stopPropagation();
      setDialogMode("edit");
      setDialogEvent(event);
      setDialogPrefillDate(null);
      setDialogOpen(true);
    },
    []
  );

  // Open dialog to create a new event (from header button)
  const handleAddEvent = () => {
    setDialogMode("create");
    setDialogEvent(null);
    setDialogPrefillDate(format(new Date(), "yyyy-MM-dd"));
    setDialogOpen(true);
  };

  // Switch from year to month view on a specific month
  const handleYearMonthClick = (monthDate: Date) => {
    setCurrentMonth(monthDate);
    setViewMode("month");
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* ---------------------------------------------------------------- */}
      {/* Header */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-6 py-4">
        <div className="flex items-center gap-4">
          {viewMode === "month" ? (
            <>
              <h1 className="text-lg font-semibold text-foreground">
                {format(currentMonth, "MMMM yyyy")}
              </h1>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={goToPrevMonth}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={goToNextMonth}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={goToToday}>
                Today
              </Button>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-foreground">
                {yearViewYear}
              </h1>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setYearViewYear((y) => y - 1)}
                  aria-label="Previous year"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setYearViewYear((y) => y + 1)}
                  aria-label="Next year"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setYearViewYear(getYear(new Date()))}
              >
                This Year
              </Button>
            </>
          )}

          {/* View mode toggle */}
          <div className="flex items-center gap-1 rounded-md border border-border/50 bg-card/20 p-0.5">
            <button
              onClick={() => setViewMode("month")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium transition-colors",
                viewMode === "month"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              <CalendarDays className="h-3 w-3" />
              Month
            </button>
            <button
              onClick={() => {
                setYearViewYear(getYear(currentMonth));
                setViewMode("year");
              }}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium transition-colors",
                viewMode === "year"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              <Grid3X3 className="h-3 w-3" />
              Year
            </button>
          </div>
        </div>

        <Button size="sm" onClick={handleAddEvent}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Event
        </Button>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Content: Month or Year view */}
      {/* ---------------------------------------------------------------- */}
      {viewMode === "month" ? (
        <div className="flex flex-1 flex-col overflow-auto">
          {/* Sticky day-of-week header */}
          <div className="sticky top-0 z-20 grid grid-cols-7 border-b border-border/30 bg-background">
            {DAY_HEADERS.map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* 6 week rows */}
          <div className="flex flex-1 flex-col">
            {weeks.map((week, idx) => (
              <WeekRow
                key={idx}
                week={week}
                weekIdx={idx}
                layout={weekLayouts[idx]}
                currentMonth={currentMonth}
                onDayClick={handleDayClick}
                onEventClick={handleEventClick}
              />
            ))}
          </div>
        </div>
      ) : (
        <YearOverview
          year={yearViewYear}
          events={yearEvents}
          onMonthClick={handleYearMonthClick}
        />
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <div className="rounded-lg bg-card/80 px-4 py-2 text-xs text-muted-foreground backdrop-blur-sm">
            Loading events...
          </div>
        </div>
      )}

      {/* Event create / edit dialog */}
      <EventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode={dialogMode}
        event={dialogEvent}
        prefillDate={dialogPrefillDate}
        onSuccess={() => {
          fetchEvents();
          if (viewMode === "year") fetchYearEvents();
        }}
      />
    </div>
  );
}
