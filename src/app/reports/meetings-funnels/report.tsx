"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Printer, Link as LinkIcon, ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import {
  FunnelBreakdownTable,
  FunnelTrendTable,
  filterBreakdownByReps,
  useFunnelBreakdown,
  type MonthBreakdown,
} from "@/components/funnel-breakdown";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[parseInt(m, 10) - 1]} ${year}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function MeetingsFunnelsReport({
  initialMonth,
  initialRepIds,
}: {
  initialMonth: string;
  initialRepIds: string[] | null;
}) {
  const [month, setMonth] = useState(initialMonth);

  // Last 6 months ending with the selected month (for trend)
  const trendMonths = useMemo(() => {
    const arr: string[] = [];
    for (let i = 5; i >= 0; i--) arr.push(shiftMonth(month, -i));
    return arr;
  }, [month]);

  // Single-month breakdown query
  const { data: singleData, loading: singleLoading } = useFunnelBreakdown([month]);
  const funnelOrder = singleData?.funnel_order ?? [];

  // Trend query (6 months)
  const { data: trendData, loading: trendLoading } = useFunnelBreakdown(trendMonths);

  // All reps appearing anywhere in the 6-month window (stable order = most recent first)
  const allReps = useMemo(() => {
    const seen = new Set<string>();
    const order: { id: string; name: string }[] = [];
    const source = trendData?.months ?? (singleData?.months ?? []);
    const desc = [...source].sort((a, b) => b.month.localeCompare(a.month));
    for (const m of desc) {
      for (const r of m.reps) {
        if (!seen.has(r.rep_id)) {
          seen.add(r.rep_id);
          order.push({ id: r.rep_id, name: r.rep_name });
        }
      }
    }
    return order;
  }, [trendData, singleData]);

  // Rep filter state. null = no filter (all reps). Otherwise, a set of visible rep IDs.
  // Initialized from URL query param, then stays null until the user interacts.
  const [selectedRepIds, setSelectedRepIds] = useState<Set<string> | null>(
    initialRepIds ? new Set(initialRepIds) : null
  );

  // Keep the URL in sync with the rep filter (without triggering a navigation).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (selectedRepIds && selectedRepIds.size > 0) {
      url.searchParams.set("reps", Array.from(selectedRepIds).join(","));
    } else {
      url.searchParams.delete("reps");
    }
    url.searchParams.set("month", month);
    window.history.replaceState(null, "", url.toString());
  }, [selectedRepIds, month]);

  const toggleRep = useCallback(
    (repId: string) => {
      setSelectedRepIds((prev) => {
        // First interaction — start from "all visible" and remove the clicked one
        const base = prev ?? new Set(allReps.map((r) => r.id));
        const next = new Set(base);
        if (next.has(repId)) next.delete(repId);
        else next.add(repId);
        // If the result matches "all visible", collapse back to null (cleaner URL)
        if (next.size === allReps.length) return null;
        return next;
      });
    },
    [allReps]
  );

  const clearFilter = useCallback(() => setSelectedRepIds(null), []);

  // Apply filter
  const visibleRepIds = selectedRepIds;
  const breakdownRaw: MonthBreakdown | undefined = singleData?.months?.[0];
  const breakdown = breakdownRaw ? filterBreakdownByReps(breakdownRaw, visibleRepIds) : undefined;
  const filteredTrend = trendData
    ? trendData.months.map((m) => filterBreakdownByReps(m, visibleRepIds))
    : [];

  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    if (typeof window === "undefined") return;
    // window.location already reflects the latest filter via the effect above
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const print = () => {
    if (typeof window !== "undefined") window.print();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-8 print:px-0 print:py-0">
        {/* Header — hidden on print */}
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Mission Control
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-card/20 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-card/40 transition-colors"
            >
              <LinkIcon className="h-3 w-3" />
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button
              onClick={print}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-card/20 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-card/40 transition-colors"
            >
              <Printer className="h-3 w-3" />
              Print / PDF
            </button>
          </div>
        </div>

        {/* Report title */}
        <div className="mb-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Think Media · Mission Control
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Sales Meetings Funnel Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Breakdown of scheduled meetings by sales rep and lead source funnel.
          </p>
        </div>

        {/* Month selector */}
        <div className="mb-6 flex items-center gap-2 print:hidden">
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/50 bg-card/20 text-muted-foreground hover:text-foreground hover:bg-card/40 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[180px] rounded-md border border-border/50 bg-card/20 px-3 py-1.5 text-center text-sm font-semibold text-foreground">
            {formatMonth(month)}
          </div>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/50 bg-card/20 text-muted-foreground hover:text-foreground hover:bg-card/40 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Rep filter chips */}
        {allReps.length > 0 && (
          <div className="mb-6 rounded-lg border border-border/30 bg-card/20 px-3 py-2.5 print:hidden">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              <Users className="h-3 w-3" />
              Filter by Rep
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={clearFilter}
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  !selectedRepIds
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border/30 bg-card/10 text-muted-foreground/60 hover:text-foreground"
                )}
              >
                All Reps
              </button>
              {allReps.map((rep) => {
                const isActive = !selectedRepIds || selectedRepIds.has(rep.id);
                return (
                  <button
                    key={rep.id}
                    onClick={() => toggleRep(rep.id)}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                      isActive
                        ? "border-border/60 bg-card/60 text-foreground"
                        : "border-border/20 bg-card/10 text-muted-foreground/40 hover:text-muted-foreground"
                    )}
                  >
                    {rep.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Print-only month caption */}
        <div className="mb-4 hidden text-sm text-muted-foreground print:block">
          Period: <span className="font-medium text-foreground">{formatMonth(month)}</span>
          {selectedRepIds && (
            <span className="ml-2">
              · Filtered to {Array.from(selectedRepIds).length} rep{selectedRepIds.size === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {/* Summary stat strip */}
        {breakdown && !singleLoading && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Total Meetings" value={breakdown.grand_totals.total.toString()} />
            <StatTile label="Active" value={breakdown.grand_totals.active.toString()} />
            <StatTile label="Canceled" value={breakdown.grand_totals.canceled.toString()} />
            <StatTile label="Reps Active" value={breakdown.reps.length.toString()} />
          </div>
        )}

        {/* Main breakdown table */}
        <div className="mb-8">
          <h2 className="mb-3 text-base font-semibold tracking-tight text-foreground">
            Meetings by Funnel × Rep
          </h2>
          {singleLoading ? (
            <LoadingPanel />
          ) : breakdown ? (
            <FunnelBreakdownTable data={breakdown} funnelOrder={funnelOrder} />
          ) : null}
        </div>

        {/* Trend */}
        <div className="mb-8">
          <h2 className="mb-3 text-base font-semibold tracking-tight text-foreground">
            6-Month Trend
          </h2>
          {trendLoading ? (
            <LoadingPanel />
          ) : trendData ? (
            <FunnelTrendTable months={filteredTrend} />
          ) : null}
        </div>

        {/* Footnotes */}
        {breakdown && (
          <div className="space-y-1 border-t border-border/20 pt-4 text-[11px] text-muted-foreground/70">
            <p>
              <span className="font-medium text-muted-foreground">Funnel buckets</span> are derived from HubSpot
              meeting titles using naming conventions (e.g. &ldquo;Think Media Coaching&rdquo;, &ldquo;Talk With
              Think&rdquo;). Titles that don&apos;t match a known funnel are grouped under &ldquo;Other&rdquo;.
            </p>
            <p>
              Internal team meetings (Think Team Zoom) are excluded — {breakdown.excluded_team_zoom_count} excluded
              for {formatMonth(month)}.
            </p>
            <p>
              {breakdown.unassigned_count} meeting{breakdown.unassigned_count === 1 ? "" : "s"} without an assigned
              sales rep are not shown in this breakdown.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
      <div className={cn("text-2xl font-bold tabular-nums text-foreground")}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="rounded-lg border border-border/30 bg-card/20 py-10 text-center text-sm text-muted-foreground">
      Loading...
    </div>
  );
}
