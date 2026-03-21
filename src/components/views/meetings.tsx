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
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MeetingContact {
  full_name: string;
  email: string;
}

interface MeetingSalesRep {
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
  total: number;
  by_outcome: Record<string, number>;
  by_rep: { rep_name: string; total: number; outcomes: Record<string, number> }[];
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
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
      <div className="mb-1 flex items-center justify-center">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={cn("text-lg font-bold", valueColor || "text-foreground")}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
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
// Main Component
// ---------------------------------------------------------------------------

export function MeetingsView() {
  // Data state
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 50, total: 0, total_pages: 0 });
  const [stats, setStats] = useState<MeetingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // Filter state
  const [month, setMonth] = useState(getCurrentMonth());
  const [repFilter, setRepFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [page, setPage] = useState(1);

  // -------------------------------------------------------------------------
  // Fetch stats
  // -------------------------------------------------------------------------
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/meetings/stats?month=${month}`);
      if (!res.ok) return;
      const json: MeetingStats = await res.json();
      setStats(json);
    } catch (err) {
      console.error("[MeetingsView] fetchStats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, [month]);

  // -------------------------------------------------------------------------
  // Fetch meetings list
  // -------------------------------------------------------------------------
  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("month", month);
      if (repFilter) params.set("rep_id", repFilter);
      if (outcomeFilter) params.set("outcome", outcomeFilter);
      params.set("page", String(page));
      params.set("per_page", "50");

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
  }, [month, repFilter, outcomeFilter, page]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [month, repFilter, outcomeFilter]);

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
        // Refresh stats
        fetchStats();
      } catch (err) {
        console.error("[MeetingsView] updateOutcome:", err);
      }
    },
    [fetchStats]
  );

  // -------------------------------------------------------------------------
  // Stat card values
  // -------------------------------------------------------------------------
  const totalMeetings = stats?.total ?? 0;
  const soldCount = stats?.by_outcome?.sold ?? 0;
  const noShowCount = stats?.by_outcome?.no_show ?? 0;
  const closeRateDenom =
    soldCount + (stats?.by_outcome?.not_qualified ?? 0) + (stats?.by_outcome?.lead ?? 0);
  const closeRate = closeRateDenom > 0 ? Math.round((soldCount / closeRateDenom) * 100) : 0;

  // -------------------------------------------------------------------------
  // Rep options from stats
  // -------------------------------------------------------------------------
  const repOptions = useMemo(() => {
    if (!stats?.by_rep) return [];
    return stats.by_rep.map((r) => ({
      value: r.rep_name,
      label: r.rep_name,
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sales meetings with outcome tagging
          </p>
        </div>

        {/* Stat Cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={Phone}
            label="Total Meetings"
            value={statsLoading ? "..." : totalMeetings.toLocaleString()}
          />
          <StatCard
            icon={Check}
            label="Sold"
            value={statsLoading ? "..." : soldCount.toLocaleString()}
            valueColor="text-green-400"
          />
          <StatCard
            icon={UserX}
            label="No Shows"
            value={statsLoading ? "..." : noShowCount.toLocaleString()}
            valueColor="text-red-400"
          />
          <StatCard
            icon={TrendingUp}
            label="Close Rate"
            value={statsLoading ? "..." : `${closeRate}%`}
            valueColor="text-primary"
          />
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-md border border-border/50 bg-card/60 px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/50"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

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
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border/30 bg-card/20">
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
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-medium text-foreground">
                          {meeting.contacts?.full_name ?? "—"}
                        </span>
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
        </div>
      </div>
    </div>
  );
}
