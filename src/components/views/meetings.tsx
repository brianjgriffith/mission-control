"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Phone,
  Hash,
  TrendingUp,
  UserX,
  ChevronLeft,
  ChevronRight,
  Check,
  Save,
  ShieldCheck,
  Target,
  ArrowUpDown,
  LayoutList,
  CalendarDays,
  RefreshCw,
} from "lucide-react";
import {
  startOfMonth,
  startOfWeek,
  addDays,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  format,
} from "date-fns";
import { ContactDetail } from "@/components/contact-detail";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MeetingContact {
  id: string;
  full_name: string;
  email: string;
}

interface MeetingSalesRep {
  id: string;
  name: string;
}

type MeetingOutcome =
  | "pending"
  | "completed"
  | "no_show"
  | "rescheduled"
  | "not_qualified"
  | "lead"
  | "sold";

interface Meeting {
  id: string;
  title: string;
  meeting_date: string;
  duration_minutes: number;
  outcome: MeetingOutcome;
  outcome_notes: string;
  contacts: MeetingContact | null;
  sales_reps: MeetingSalesRep | null;
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

interface MeetingsResponse {
  meetings: Meeting[];
  pagination: Pagination;
  summary: {
    total: number;
    by_outcome: Record<string, number>;
  };
}

interface MeetingStats {
  total_meetings: number;
  by_outcome: Record<string, number>;
  per_rep: { rep_name: string; total_meetings: number; outcomes: Record<string, number> }[];
}

// Lead quality types
interface LeadQualityOverall {
  total_meetings: number;
  completed: number;
  no_shows: number;
  rescheduled: number;
  not_qualified: number;
  leads: number;
  sold: number;
  no_show_rate: number;
  qualification_rate: number;
  close_rate: number;
}

interface LeadQualityRep {
  rep_id: string;
  rep_name: string;
  total_meetings: number;
  completed: number;
  no_shows: number;
  rescheduled: number;
  not_qualified: number;
  leads: number;
  sold: number;
  no_show_rate: number;
  qualification_rate: number;
  close_rate: number;
  revenue_from_sold: number;
}

interface LeadQualitySource {
  source: string;
  total_meetings: number;
  sold: number;
  close_rate: number;
}

interface LeadQualityData {
  period: string;
  overall: LeadQualityOverall;
  by_rep: LeadQualityRep[];
  by_source: LeadQualitySource[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(m, 10) - 1]} '${year.slice(2)}`;
}

function fmtDateTime(str: string): string {
  const d = new Date(str);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  }) + ", " + d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n / 100);
}

function noShowRateColor(rate: number): string {
  if (rate < 15) return "text-green-400";
  if (rate <= 25) return "text-amber-400";
  return "text-red-400";
}

function qualificationRateColor(rate: number): string {
  if (rate >= 70) return "text-green-400";
  if (rate >= 50) return "text-amber-400";
  return "text-red-400";
}

function closeRateColor(rate: number): string {
  if (rate > 40) return "text-green-400";
  if (rate >= 20) return "text-amber-400";
  return "text-red-400";
}

const OUTCOME_OPTIONS: { value: MeetingOutcome; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No Show" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "not_qualified", label: "Not Qualified" },
  { value: "lead", label: "Lead" },
  { value: "sold", label: "Sold" },
];

const OUTCOME_STYLES: Record<MeetingOutcome, { bg: string; text: string }> = {
  pending:       { bg: "bg-zinc-500/15",   text: "text-zinc-400" },
  completed:     { bg: "bg-blue-500/15",   text: "text-blue-400" },
  no_show:       { bg: "bg-red-500/15",    text: "text-red-400" },
  rescheduled:   { bg: "bg-amber-500/15",  text: "text-amber-400" },
  not_qualified: { bg: "bg-orange-500/15", text: "text-orange-400" },
  lead:          { bg: "bg-cyan-500/15",   text: "text-cyan-400" },
  sold:          { bg: "bg-green-500/15",  text: "text-green-400" },
};

function getOutcomeStyle(outcome: string) {
  return OUTCOME_STYLES[outcome as MeetingOutcome] ?? { bg: "bg-muted", text: "text-muted-foreground" };
}

// ---------------------------------------------------------------------------
// Calendar types & constants
// ---------------------------------------------------------------------------

interface SalesRep {
  id: string;
  name: string;
  email: string;
  rep_type: string;
  is_active: boolean;
}

const REP_COLORS = [
  "#b4befe", "#89dceb", "#a6e3a1", "#fab387",
  "#f38ba8", "#cba6f7", "#f9e2af", "#74c7ec",
];

const CAL_DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_PILLS = 3;

function getOutcomeLabel(outcome: string) {
  const opt = OUTCOME_OPTIONS.find((o) => o.value === outcome);
  return opt?.label ?? outcome;
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  valueColor,
  subValue,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  valueColor?: string;
  subValue?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
      <div className="mb-1 flex items-center justify-center">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={cn("text-lg font-bold", valueColor || "text-foreground")}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      {subValue && (
        <div className="mt-0.5 text-[10px] text-muted-foreground/60">{subValue}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Outcome Editor
// ---------------------------------------------------------------------------

function OutcomeBadge({
  meeting,
  onUpdate,
}: {
  meeting: Meeting;
  onUpdate: (id: string, outcome: MeetingOutcome, notes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<MeetingOutcome>(meeting.outcome);
  const [notes, setNotes] = useState(meeting.outcome_notes || "");
  const [saving, setSaving] = useState(false);

  const style = getOutcomeStyle(meeting.outcome);

  if (!editing) {
    return (
      <button
        onClick={() => {
          setEditing(true);
          setSelectedOutcome(meeting.outcome);
          setNotes(meeting.outcome_notes || "");
        }}
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer hover:ring-1 hover:ring-border",
          style.bg,
          style.text
        )}
      >
        {getOutcomeLabel(meeting.outcome)}
      </button>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(meeting.id, selectedOutcome, notes);
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={selectedOutcome}
        onChange={(e) => setSelectedOutcome(e.target.value as MeetingOutcome)}
        className="rounded-md border border-border/50 bg-card/60 px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/50"
      >
        {OUTCOME_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes..."
        className="rounded-md border border-border/50 bg-card/60 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/50"
      />
      <div className="flex gap-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors"
        >
          <Save className="h-3 w-3" />
          {saving ? "..." : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rep Performance Table
// ---------------------------------------------------------------------------

type RepSortKey = "close_rate" | "total_meetings" | "no_show_rate" | "revenue_from_sold";

function RepPerformanceTable({ reps }: { reps: LeadQualityRep[] }) {
  const [sortKey, setSortKey] = useState<RepSortKey>("close_rate");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    return [...reps].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [reps, sortKey, sortAsc]);

  const handleSort = (key: RepSortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortHeader = ({ label, field }: { label: string; field: RepSortKey }) => (
    <th
      className="px-3 py-2.5 cursor-pointer hover:text-muted-foreground transition-colors select-none"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={cn("h-3 w-3", sortKey === field ? "text-primary" : "text-muted-foreground/30")} />
      </span>
    </th>
  );

  if (reps.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/30 bg-card/20">
      <div className="border-b border-border/20 px-3 py-2.5">
        <h3 className="text-sm font-medium text-foreground">Rep Performance</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/20 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              <th className="px-3 py-2.5">Rep</th>
              <SortHeader label="Meetings" field="total_meetings" />
              <SortHeader label="No-Shows" field="no_show_rate" />
              <th className="px-3 py-2.5">Qualified</th>
              <th className="px-3 py-2.5">Sold</th>
              <SortHeader label="Close Rate" field="close_rate" />
              <SortHeader label="Revenue" field="revenue_from_sold" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((rep) => (
              <tr
                key={rep.rep_id}
                className="border-b border-border/10 transition-colors hover:bg-card/40"
              >
                <td className="px-3 py-2.5 text-xs font-medium text-foreground">
                  {rep.rep_name}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {rep.total_meetings}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  <span className={noShowRateColor(rep.no_show_rate)}>
                    {rep.no_shows} ({rep.no_show_rate}%)
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {rep.total_meetings - rep.no_shows - rep.rescheduled - rep.not_qualified}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  <span className="text-green-400">{rep.sold}</span>
                </td>
                <td className="px-3 py-2.5 text-xs">
                  <span className={cn("font-medium", closeRateColor(rep.close_rate))}>
                    {rep.close_rate}%
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {rep.revenue_from_sold > 0 ? fmtCurrency(rep.revenue_from_sold) : "--"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source Table
// ---------------------------------------------------------------------------

function SourceTable({ sources }: { sources: LeadQualitySource[] }) {
  if (sources.length === 0 || (sources.length === 1 && sources[0].source === "Unknown")) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border/30 bg-card/20">
      <div className="border-b border-border/20 px-3 py-2.5">
        <h3 className="text-sm font-medium text-foreground">Performance by Source</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/20 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Meetings</th>
              <th className="px-3 py-2.5">Sold</th>
              <th className="px-3 py-2.5">Close Rate</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((src) => (
              <tr
                key={src.source}
                className="border-b border-border/10 transition-colors hover:bg-card/40"
              >
                <td className="px-3 py-2.5 text-xs font-medium text-foreground">
                  {src.source}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {src.total_meetings}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  <span className="text-green-400">{src.sold}</span>
                </td>
                <td className="px-3 py-2.5 text-xs">
                  <span className={cn("font-medium", closeRateColor(src.close_rate))}>
                    {src.close_rate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rep Filter Chips (for calendar view)
// ---------------------------------------------------------------------------

function RepFilterChips({
  reps,
  repColors,
  activeRepIds,
  onToggle,
  onToggleAll,
}: {
  reps: SalesRep[];
  repColors: Record<string, string>;
  activeRepIds: Set<string>;
  onToggle: (repId: string) => void;
  onToggleAll: () => void;
}) {
  const allActive = reps.length > 0 && reps.every((r) => activeRepIds.has(r.id));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={onToggleAll}
        className={cn(
          "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium cursor-pointer transition-colors",
          allActive
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border/30 bg-card/10 text-muted-foreground/50 hover:text-muted-foreground"
        )}
      >
        All Reps
      </button>
      {reps.map((rep) => {
        const color = repColors[rep.id] ?? "#b4befe";
        const isActive = activeRepIds.has(rep.id);
        return (
          <button
            key={rep.id}
            onClick={() => onToggle(rep.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium cursor-pointer transition-colors",
              isActive
                ? "border-transparent"
                : "border-border/30 bg-card/10 text-muted-foreground/40 hover:text-muted-foreground"
            )}
            style={
              isActive
                ? { backgroundColor: color + "28", color, borderColor: color + "60" }
                : undefined
            }
          >
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            {rep.name}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meetings Calendar Grid
// ---------------------------------------------------------------------------

function DayDetailPopup({
  dateKey,
  meetings,
  repColors,
  onClose,
}: {
  dateKey: string;
  meetings: Meeting[];
  repColors: Record<string, string>;
  onClose: () => void;
}) {
  const sorted = useMemo(
    () => [...meetings].sort((a, b) => new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime()),
    [meetings]
  );

  const dateLabel = new Date(dateKey + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg max-h-[80vh] overflow-hidden rounded-lg border border-border/50 bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/20 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{dateLabel}</h3>
            <p className="text-[11px] text-muted-foreground">
              {sorted.length} meeting{sorted.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors"
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>
        {/* Meeting list */}
        <div className="overflow-y-auto max-h-[calc(80vh-60px)] divide-y divide-border/10">
          {sorted.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              No meetings this day
            </div>
          ) : (
            sorted.map((m) => {
              const repId = m.sales_reps?.id;
              const color = repId ? (repColors[repId] ?? "#b4befe") : "#6b7280";
              const time = new Date(m.meeting_date).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
              const style = getOutcomeStyle(m.outcome);
              return (
                <div key={m.id} className="flex items-start gap-3 px-4 py-3 hover:bg-card/30 transition-colors">
                  {/* Time column */}
                  <div className="w-16 flex-shrink-0 pt-0.5 text-right">
                    <span className="text-xs font-medium text-foreground">{time}</span>
                    {m.duration_minutes > 0 && (
                      <div className="text-[10px] text-muted-foreground/50">{m.duration_minutes}m</div>
                    )}
                  </div>
                  {/* Color bar */}
                  <div className="w-1 flex-shrink-0 self-stretch rounded-full mt-1" style={{ backgroundColor: color }} />
                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground truncate">
                      {m.title || "Meeting"}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      {m.sales_reps && (
                        <span className="text-[11px] font-medium" style={{ color }}>
                          {m.sales_reps.name}
                        </span>
                      )}
                      {m.contacts && (
                        <span className="text-[11px] text-muted-foreground">
                          {m.contacts.full_name}
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                          style.bg,
                          style.text
                        )}
                      >
                        {getOutcomeLabel(m.outcome)}
                      </span>
                    </div>
                    {m.outcome_notes && (
                      <p className="mt-1 text-[11px] text-muted-foreground/60 truncate">
                        {m.outcome_notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function MeetingsCalendarGrid({
  meetings,
  month,
  repColors,
  activeRepIds,
}: {
  meetings: Meeting[];
  month: string;
  repColors: Record<string, string>;
  activeRepIds: Set<string>;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [year, mon] = month.split("-").map(Number);
  const monthDate = new Date(year, mon - 1, 1);
  const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 0 });
  const gridDays = eachDayOfInterval({ start: gridStart, end: addDays(gridStart, 41) });
  const weeks: Date[][] = [];
  for (let i = 0; i < gridDays.length; i += 7) {
    weeks.push(gridDays.slice(i, i + 7));
  }

  // Bucket filtered meetings by date
  const filteredMeetings = meetings.filter(
    (m) => activeRepIds.size === 0 || (m.sales_reps && activeRepIds.has(m.sales_reps.id))
  );

  const byDate: Record<string, Meeting[]> = {};
  for (const m of filteredMeetings) {
    const key = m.meeting_date.slice(0, 10);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(m);
  }

  // Reset selected day when month changes
  useEffect(() => {
    setSelectedDay(null);
  }, [month]);

  return (
    <>
      <div className="rounded-lg border border-border/30 bg-card/20 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border/20">
          {CAL_DAY_HEADERS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground/60">
              {d}
            </div>
          ))}
        </div>
        {/* Week rows */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-border/10 last:border-b-0">
            {week.map((day, di) => {
              const inMonth = isSameMonth(day, monthDate);
              const todayCell = isToday(day);
              const key = format(day, "yyyy-MM-dd");
              const cellMeetings = byDate[key] ?? [];
              const visible = cellMeetings.slice(0, MAX_PILLS);
              const overflow = cellMeetings.length - visible.length;
              return (
                <div
                  key={di}
                  onClick={() => cellMeetings.length > 0 && setSelectedDay(key)}
                  className={cn(
                    "min-h-[100px] flex flex-col border-r border-border/10 last:border-r-0 p-1 transition-colors",
                    !inMonth && "opacity-35",
                    cellMeetings.length > 0 && "cursor-pointer hover:bg-card/40"
                  )}
                >
                  <div className="flex justify-end mb-1 px-1 pt-0.5">
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                        todayCell
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground/60"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {visible.map((m) => {
                      const repId = m.sales_reps?.id;
                      const color = repId ? (repColors[repId] ?? "#b4befe") : "#6b7280";
                      const time = new Date(m.meeting_date).toLocaleTimeString("en-US", {
                        hour: "numeric", minute: "2-digit", hour12: true,
                      });
                      return (
                        <div
                          key={m.id}
                          title={`${m.title || "Meeting"} — ${m.sales_reps?.name ?? "—"} @ ${time}`}
                          className="rounded px-1.5 py-0.5 text-[10px] leading-tight text-white/90 truncate"
                          style={{ backgroundColor: color + "cc" }}
                        >
                          {m.sales_reps?.name ? `${m.sales_reps.name.split(" ")[0]}: ` : ""}{m.contacts?.full_name || m.title || "Meeting"}
                        </div>
                      );
                    })}
                    {overflow > 0 && (
                      <span className="px-1 text-[10px] text-muted-foreground/60">
                        +{overflow} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Day detail popup */}
      {selectedDay && (
        <DayDetailPopup
          dateKey={selectedDay}
          meetings={byDate[selectedDay] ?? []}
          repColors={repColors}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Contact Assigner — inline search to assign a contact to a meeting
// ---------------------------------------------------------------------------

interface ContactSearchResult {
  id: string;
  full_name: string;
  email: string;
}

function ContactAssigner({
  meeting,
  onAssign,
  onClickContact,
}: {
  meeting: Meeting;
  onAssign: (meetingId: string, contactId: string) => void;
  onClickContact: (contactId: string) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!searching || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const json = await res.json();
          setResults(json.contacts || []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 300); // debounce

    return () => clearTimeout(timer);
  }, [searching, query]);

  if (meeting.contacts) {
    return (
      <button
        onClick={() => onClickContact(meeting.contacts!.id)}
        className="text-xs font-medium text-primary hover:text-primary/80 hover:underline text-left"
      >
        {meeting.contacts.full_name}
      </button>
    );
  }

  if (!searching) {
    return (
      <button
        onClick={() => setSearching(true)}
        className="text-[10px] text-muted-foreground/40 hover:text-primary"
      >
        + Assign
      </button>
    );
  }

  return (
    <div className="relative">
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => {
          // Delay to allow click on results
          setTimeout(() => setSearching(false), 200);
        }}
        placeholder="Search contacts..."
        className="w-36 rounded-md border border-border/50 bg-card/60 px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/50"
      />
      {results.length > 0 && (
        <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-md border border-border bg-background shadow-xl">
          {results.map((c) => (
            <button
              key={c.id}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur
                onAssign(meeting.id, c.id);
                setSearching(false);
                setQuery("");
              }}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent/50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground truncate">{c.full_name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{c.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {loading && query.length >= 2 && (
        <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-md border border-border bg-background px-3 py-2 shadow-xl">
          <span className="text-[10px] text-muted-foreground">Searching...</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function MeetingsView() {
  // Data state
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 50, total: 0, total_pages: 0 });
  const [stats, setStats] = useState<MeetingStats | null>(null);
  const [leadQuality, setLeadQuality] = useState<LeadQualityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [lqLoading, setLqLoading] = useState(true);

  // Filter state
  const [month, setMonth] = useState(getCurrentMonth());
  const [dateMode, setDateMode] = useState<"month" | "custom">("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [repFilter, setRepFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [activeRepIds, setActiveRepIds] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch stats
  // -------------------------------------------------------------------------
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateMode === "custom" && customStart && customEnd) {
        params.set("start_date", customStart);
        params.set("end_date", customEnd);
      } else {
        params.set("month", month);
      }
      const res = await fetch(`/api/meetings/stats?${params.toString()}`);
      if (!res.ok) return;
      const json: MeetingStats = await res.json();
      setStats(json);
    } catch (err) {
      console.error("[MeetingsView] fetchStats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, [month, dateMode, customStart, customEnd]);

  // -------------------------------------------------------------------------
  // Fetch lead quality metrics
  // -------------------------------------------------------------------------
  const fetchLeadQuality = useCallback(async () => {
    setLqLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("month", month);
      const res = await fetch(`/api/meetings/lead-quality?${params.toString()}`);
      if (!res.ok) return;
      const json: LeadQualityData = await res.json();
      setLeadQuality(json);
    } catch (err) {
      console.error("[MeetingsView] fetchLeadQuality:", err);
    } finally {
      setLqLoading(false);
    }
  }, [month]);

  // -------------------------------------------------------------------------
  // Fetch meetings list
  // -------------------------------------------------------------------------
  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateMode === "custom" && customStart && customEnd) {
        params.set("start_date", customStart);
        params.set("end_date", customEnd);
      } else {
        params.set("month", month);
      }
      if (repFilter) params.set("rep_name", repFilter);
      if (outcomeFilter) params.set("outcome", outcomeFilter);
      params.set("page", String(page));
      params.set("per_page", viewMode === "calendar" ? "500" : "50");

      const res = await fetch(`/api/meetings?${params.toString()}`);
      if (!res.ok) return;
      const json: MeetingsResponse = await res.json();
      setMeetings(json.meetings ?? []);
      setPagination(json.pagination);
    } catch (err) {
      console.error("[MeetingsView] fetchMeetings:", err);
    } finally {
      setLoading(false);
    }
  }, [month, dateMode, customStart, customEnd, repFilter, outcomeFilter, page, viewMode]);

  // -------------------------------------------------------------------------
  // Fetch sales reps (for calendar rep chips)
  // -------------------------------------------------------------------------
  const fetchSalesReps = useCallback(async () => {
    try {
      const res = await fetch("/api/sales-reps");
      if (!res.ok) return;
      const json = await res.json();
      const reps: SalesRep[] = json.reps ?? [];
      setSalesReps(reps);
      setActiveRepIds(new Set(reps.map((r) => r.id)));
    } catch (err) {
      console.error("[MeetingsView] fetchSalesReps:", err);
    }
  }, []);

  useEffect(() => {
    fetchSalesReps();
  }, [fetchSalesReps]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchLeadQuality();
  }, [fetchLeadQuality]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [month, dateMode, customStart, customEnd, repFilter, outcomeFilter]);

  // -------------------------------------------------------------------------
  // Update meeting outcome
  // -------------------------------------------------------------------------
  const handleUpdateOutcome = useCallback(
    async (id: string, outcome: MeetingOutcome, notes: string) => {
      try {
        const res = await fetch(`/api/meetings/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome, outcome_notes: notes }),
        });
        if (!res.ok) return;
        // Update local state
        setMeetings((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, outcome, outcome_notes: notes } : m
          )
        );
        // Refresh stats + lead quality
        fetchStats();
        fetchLeadQuality();
      } catch (err) {
        console.error("[MeetingsView] updateOutcome:", err);
      }
    },
    [fetchStats, fetchLeadQuality]
  );

  // -------------------------------------------------------------------------
  // Assign contact to meeting
  // -------------------------------------------------------------------------
  const handleAssignContact = useCallback(
    async (meetingId: string, contactId: string) => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contact_id: contactId }),
        });
        if (!res.ok) return;
        const json = await res.json();
        // Update local state with the returned meeting (includes contact join)
        setMeetings((prev) =>
          prev.map((m) =>
            m.id === meetingId ? { ...m, contacts: json.meeting.contacts } : m
          )
        );
      } catch (err) {
        console.error("[MeetingsView] assignContact:", err);
      }
    },
    []
  );

  // -------------------------------------------------------------------------
  // Lead quality stat card values
  // -------------------------------------------------------------------------
  const lq = leadQuality?.overall;
  const totalMeetings = lq?.total_meetings ?? stats?.total_meetings ?? 0;
  const noShowRate = lq?.no_show_rate ?? 0;
  const qualRate = lq?.qualification_rate ?? 0;
  const closeRate = lq?.close_rate ?? 0;

  // -------------------------------------------------------------------------
  // Rep options from stats
  // -------------------------------------------------------------------------
  const repOptions = useMemo(() => {
    if (!stats?.per_rep) return [];
    return stats.per_rep
      .filter((r) => r.rep_name !== "Unknown")
      .map((r) => ({
        value: r.rep_name,
        label: `${r.rep_name} (${r.total_meetings})`,
      }));
  }, [stats]);

  // -------------------------------------------------------------------------
  // Month options
  // -------------------------------------------------------------------------
  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      options.push({ value: val, label: formatMonth(val) });
    }
    return options;
  }, []);

  // -------------------------------------------------------------------------
  // Rep colors (deterministic by index)
  // -------------------------------------------------------------------------
  const repColors = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    salesReps.forEach((rep, i) => {
      map[rep.id] = REP_COLORS[i % REP_COLORS.length];
    });
    return map;
  }, [salesReps]);

  const handleRepToggle = useCallback((repId: string) => {
    setActiveRepIds((prev) => {
      const next = new Set(prev);
      if (next.has(repId)) next.delete(repId);
      else next.add(repId);
      return next;
    });
  }, []);

  const [syncResult, setSyncResult] = useState<string | null>(null);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/sync-meetings?days=3", { method: "POST" });
      const text = await res.text();
      let result: any;
      try { result = JSON.parse(text); } catch { result = { error: text }; }
      if (res.ok) {
        setSyncResult(`Synced: ${result.fetched} found, ${result.with_rep} matched rep, ${result.upserted} saved`);
        fetchMeetings();
        fetchStats();
        fetchLeadQuality();
      } else {
        setSyncResult(`Error ${res.status}: ${result.error || text.slice(0, 100)}`);
      }
    } catch (err: any) {
      console.error("[MeetingsView] syncNow:", err);
      setSyncResult(`Sync failed: ${err?.message || "network error"}`);
    } finally {
      setSyncing(false);
    }
  }, [fetchMeetings, fetchStats, fetchLeadQuality]);

  const handleToggleAllReps = useCallback(() => {
    setActiveRepIds((prev) => {
      const allActive = salesReps.every((r) => prev.has(r.id));
      return allActive ? new Set<string>() : new Set(salesReps.map((r) => r.id));
    });
  }, [salesReps]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sales meetings with outcome tagging
            </p>
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-card/20 px-2.5 py-1.5 text-[11px] font-medium transition-colors",
              syncing
                ? "text-muted-foreground/50 cursor-not-allowed"
                : "text-muted-foreground hover:text-foreground hover:bg-card/40"
            )}
          >
            <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
          {syncResult && (
            <span className="text-[10px] text-muted-foreground max-w-[300px] truncate" title={syncResult}>
              {syncResult}
            </span>
          )}
          <div className="flex items-center gap-1 rounded-md border border-border/50 bg-card/20 p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                viewMode === "list"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              <LayoutList className="h-3 w-3" />
              List
            </button>
            <button
              onClick={() => {
                setViewMode("calendar");
                setDateMode("month");
                setRepFilter("");
                setOutcomeFilter("");
              }}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                viewMode === "calendar"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              <CalendarDays className="h-3 w-3" />
              Calendar
            </button>
          </div>
          </div>
        </div>

        {/* Enhanced Stat Cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={Phone}
            label="Total Meetings"
            value={lqLoading && statsLoading ? "..." : totalMeetings.toLocaleString()}
            subValue={lq ? `${lq.sold} sold, ${lq.leads} leads` : undefined}
          />
          <StatCard
            icon={UserX}
            label="No-Show Rate"
            value={lqLoading ? "..." : `${noShowRate}%`}
            valueColor={lqLoading ? undefined : noShowRateColor(noShowRate)}
            subValue={lq ? `${lq.no_shows} of ${lq.total_meetings}` : undefined}
          />
          <StatCard
            icon={ShieldCheck}
            label="Qualification Rate"
            value={lqLoading ? "..." : `${qualRate}%`}
            valueColor={lqLoading ? undefined : qualificationRateColor(qualRate)}
            subValue="excl. no-shows & reschedules"
          />
          <StatCard
            icon={Target}
            label="Close Rate"
            value={lqLoading ? "..." : `${closeRate}%`}
            valueColor={lqLoading ? undefined : closeRateColor(closeRate)}
            subValue={lq ? `${lq.sold} of ${lq.sold + lq.leads + lq.not_qualified} decisions` : undefined}
          />
        </div>

        {/* Month selector (shared) */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {viewMode === "list" && (
            <div className="flex rounded-md border border-border/50 overflow-hidden">
              <button
                onClick={() => setDateMode("month")}
                className={cn(
                  "px-2.5 py-1.5 text-xs font-medium transition-colors",
                  dateMode === "month"
                    ? "bg-primary/20 text-primary"
                    : "bg-card/60 text-muted-foreground hover:text-foreground"
                )}
              >
                Month
              </button>
              <button
                onClick={() => {
                  setDateMode("custom");
                  if (!customStart) {
                    const now = new Date();
                    const y = now.getFullYear();
                    const m = String(now.getMonth() + 1).padStart(2, "0");
                    setCustomStart(`${y}-${m}-01`);
                    setCustomEnd(`${y}-${m}-${String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`);
                  }
                }}
                className={cn(
                  "px-2.5 py-1.5 text-xs font-medium transition-colors",
                  dateMode === "custom"
                    ? "bg-primary/20 text-primary"
                    : "bg-card/60 text-muted-foreground hover:text-foreground"
                )}
              >
                Custom
              </button>
            </div>
          )}

          {dateMode === "month" || viewMode === "calendar" ? (
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-md border border-border/50 bg-card/60 px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/50"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-md border border-border/50 bg-card/60 px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/50"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-md border border-border/50 bg-card/60 px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
          )}

          {viewMode === "list" && (
            <>
              <select
                value={repFilter}
                onChange={(e) => setRepFilter(e.target.value)}
                className="rounded-md border border-border/50 bg-card/60 px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">All Reps</option>
                {repOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                className="rounded-md border border-border/50 bg-card/60 px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">All Outcomes</option>
                {OUTCOME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </>
          )}
        </div>

        {/* Calendar: rep filter chips */}
        {viewMode === "calendar" && (
          <div className="mb-4">
            <RepFilterChips
              reps={salesReps}
              repColors={repColors}
              activeRepIds={activeRepIds}
              onToggle={handleRepToggle}
              onToggleAll={handleToggleAllReps}
            />
          </div>
        )}

        {/* Calendar mode */}
        {viewMode === "calendar" && (
          loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Loading meetings...
            </div>
          ) : (
            <MeetingsCalendarGrid
              meetings={meetings}
              month={month}
              repColors={repColors}
              activeRepIds={activeRepIds}
            />
          )
        )}

        {/* Table (list mode) */}
        {viewMode === "list" && <div className="rounded-lg border border-border/30 bg-card/20">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Loading meetings...
            </div>
          ) : meetings.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              No meetings found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/20 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    <th className="px-3 py-2.5">Date/Time</th>
                    <th className="px-3 py-2.5">Title</th>
                    <th className="px-3 py-2.5">Contact</th>
                    <th className="px-3 py-2.5">Sales Rep</th>
                    <th className="px-3 py-2.5">Outcome</th>
                    <th className="px-3 py-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((meeting) => (
                    <tr
                      key={meeting.id}
                      className="border-b border-border/10 transition-colors hover:bg-card/40"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-foreground">
                        {fmtDateTime(meeting.meeting_date)}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5 text-xs text-muted-foreground" title={meeting.title}>
                        {meeting.title || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <ContactAssigner
                          meeting={meeting}
                          onAssign={handleAssignContact}
                          onClickContact={setSelectedContactId}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {meeting.sales_reps?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <OutcomeBadge
                          meeting={meeting}
                          onUpdate={handleUpdateOutcome}
                        />
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                        {meeting.outcome_notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between border-t border-border/20 px-3 py-2.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  page <= 1
                    ? "cursor-not-allowed text-muted-foreground/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                )}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <span className="text-[11px] text-muted-foreground">
                Page {pagination.page} of {pagination.total_pages.toLocaleString()}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                disabled={page >= pagination.total_pages}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  page >= pagination.total_pages
                    ? "cursor-not-allowed text-muted-foreground/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                )}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>}

        {/* Lead Quality Section (list mode only) */}
        {viewMode === "list" && !lqLoading && leadQuality && (
          <div className="mt-8 space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Lead Quality</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sales rep performance and source analysis for {formatMonth(leadQuality.period)}
              </p>
            </div>

            {/* Per-Rep Performance */}
            <RepPerformanceTable reps={leadQuality.by_rep} />

            {/* By Source */}
            <SourceTable sources={leadQuality.by_source} />
          </div>
        )}
      </div>

      {/* Contact Detail Slide-over */}
      {selectedContactId && (
        <ContactDetail
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
        />
      )}
    </div>
  );
}
