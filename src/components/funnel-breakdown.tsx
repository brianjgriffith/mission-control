"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

// ---------------------------------------------------------------------------
// Types (mirror API shape)
// ---------------------------------------------------------------------------

interface Counts { total: number; active: number; canceled: number }
interface RepBreakdown {
  rep_id: string;
  rep_name: string;
  funnels: Record<string, Counts>;
  totals: Counts;
}
interface MonthBreakdown {
  month: string;
  reps: RepBreakdown[];
  totals_by_funnel: Record<string, Counts>;
  grand_totals: Counts;
  unassigned_count: number;
  excluded_team_zoom_count: number;
}

interface ApiResponse {
  months: MonthBreakdown[];
  funnel_order: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[parseInt(m, 10) - 1]} ${year}`;
}

function pad(v: number | undefined): string {
  return v == null ? "—" : String(v);
}

// Only show funnels that have data for at least one rep in the given month.
function visibleFunnels(month: MonthBreakdown, funnelOrder: string[]): string[] {
  return funnelOrder.filter((f) => {
    const t = month.totals_by_funnel[f];
    return t && t.total > 0;
  });
}

// ---------------------------------------------------------------------------
// Single-month breakdown table (funnel × rep)
// ---------------------------------------------------------------------------

export function FunnelBreakdownTable({
  data,
  funnelOrder,
  showActiveCanceledRows = true,
  compact = false,
}: {
  data: MonthBreakdown;
  funnelOrder: string[];
  showActiveCanceledRows?: boolean;
  compact?: boolean;
}) {
  const funnels = visibleFunnels(data, funnelOrder);
  const reps = data.reps;

  const cellPad = compact ? "px-2.5 py-1.5" : "px-3 py-2.5";
  const numText = compact ? "text-[11px]" : "text-xs";

  if (reps.length === 0) {
    return (
      <div className="rounded-lg border border-border/30 bg-card/20 px-4 py-10 text-center text-sm text-muted-foreground">
        No meetings for {formatMonth(data.month)}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/30 bg-card/20">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/20 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            <th className={cn(cellPad, "sticky left-0 bg-card/20")}>Funnel / Type</th>
            {reps.map((r) => (
              <th key={r.rep_id} className={cn(cellPad, "text-right")}>
                {r.rep_name}
              </th>
            ))}
            <th className={cn(cellPad, "text-right")}>Total</th>
          </tr>
        </thead>
        <tbody>
          {funnels.map((funnel) => {
            const totalRow = data.totals_by_funnel[funnel];
            return (
              <tr key={funnel} className="border-b border-border/10 hover:bg-card/40">
                <td className={cn(cellPad, "sticky left-0 bg-card/20 font-medium text-foreground", numText)}>
                  {funnel}
                </td>
                {reps.map((r) => {
                  const c = r.funnels[funnel];
                  return (
                    <td key={r.rep_id} className={cn(cellPad, "text-right tabular-nums", numText, c ? "text-foreground" : "text-muted-foreground/30")}>
                      {c ? c.total : "—"}
                    </td>
                  );
                })}
                <td className={cn(cellPad, "text-right font-semibold tabular-nums text-foreground", numText)}>
                  {pad(totalRow?.total)}
                </td>
              </tr>
            );
          })}

          {/* Total row */}
          <tr className="border-t border-border/30 bg-card/30">
            <td className={cn(cellPad, "sticky left-0 bg-card/30 text-xs font-semibold uppercase tracking-wide text-foreground")}>
              Total
            </td>
            {reps.map((r) => (
              <td key={r.rep_id} className={cn(cellPad, "text-right font-semibold tabular-nums text-foreground", numText)}>
                {r.totals.total}
              </td>
            ))}
            <td className={cn(cellPad, "text-right font-bold tabular-nums text-foreground", numText)}>
              {data.grand_totals.total}
            </td>
          </tr>

          {showActiveCanceledRows && (
            <>
              <tr className="border-t border-border/10 bg-card/10">
                <td className={cn(cellPad, "sticky left-0 bg-card/10 text-[11px] text-muted-foreground")}>
                  ↳ Active
                </td>
                {reps.map((r) => (
                  <td key={r.rep_id} className={cn(cellPad, "text-right tabular-nums text-muted-foreground", numText)}>
                    {r.totals.active}
                  </td>
                ))}
                <td className={cn(cellPad, "text-right tabular-nums text-muted-foreground", numText)}>
                  {data.grand_totals.active}
                </td>
              </tr>
              <tr className="bg-card/10">
                <td className={cn(cellPad, "sticky left-0 bg-card/10 text-[11px] text-muted-foreground")}>
                  ↳ Canceled
                </td>
                {reps.map((r) => (
                  <td key={r.rep_id} className={cn(cellPad, "text-right tabular-nums text-muted-foreground", numText)}>
                    {r.totals.canceled}
                  </td>
                ))}
                <td className={cn(cellPad, "text-right tabular-nums text-muted-foreground", numText)}>
                  {data.grand_totals.canceled}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend table — rep × month, total meetings per cell
// ---------------------------------------------------------------------------

export function FunnelTrendTable({ months }: { months: MonthBreakdown[] }) {
  // Collect every rep that appears in any month, keep stable order by most recent month's ranking
  const repOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: { id: string; name: string }[] = [];
    // Start with most recent month's ordering
    const monthsDesc = [...months].sort((a, b) => b.month.localeCompare(a.month));
    for (const m of monthsDesc) {
      for (const r of m.reps) {
        if (!seen.has(r.rep_id)) {
          seen.add(r.rep_id);
          order.push({ id: r.rep_id, name: r.rep_name });
        }
      }
    }
    return order;
  }, [months]);

  // Sort months chronologically (oldest → newest) for the table columns
  const sortedMonths = useMemo(
    () => [...months].sort((a, b) => a.month.localeCompare(b.month)),
    [months]
  );

  if (sortedMonths.length === 0 || repOrder.length === 0) return null;

  // For each rep, compute totals per month
  const repRows = repOrder.map(({ id, name }) => {
    const perMonth = sortedMonths.map((m) => m.reps.find((r) => r.rep_id === id)?.totals.total ?? 0);
    return { id, name, perMonth };
  });

  const monthTotals = sortedMonths.map((m) => m.grand_totals.total);

  function trendIcon(values: number[]) {
    if (values.length < 2) return <Minus className="h-3 w-3 text-muted-foreground/40" />;
    const first = values[0];
    const last = values[values.length - 1];
    if (last > first) return <TrendingUp className="h-3 w-3 text-green-400" />;
    if (last < first) return <TrendingDown className="h-3 w-3 text-red-400" />;
    return <Minus className="h-3 w-3 text-muted-foreground/60" />;
  }

  return (
    <div className="rounded-lg border border-border/30 bg-card/20">
      <div className="border-b border-border/20 px-3 py-2.5">
        <h3 className="text-sm font-medium text-foreground">Monthly Trend — Total Meetings per Rep</h3>
        <p className="text-[11px] text-muted-foreground/70">Excludes internal team meetings and unassigned records</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/20 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              <th className="px-3 py-2.5">Rep</th>
              {sortedMonths.map((m) => (
                <th key={m.month} className="px-3 py-2.5 text-right">{formatMonth(m.month)}</th>
              ))}
              <th className="px-3 py-2.5 text-right">Trend</th>
            </tr>
          </thead>
          <tbody>
            {repRows.map((row) => (
              <tr key={row.id} className="border-b border-border/10 hover:bg-card/40">
                <td className="px-3 py-2.5 text-xs font-medium text-foreground">{row.name}</td>
                {row.perMonth.map((v, i) => (
                  <td key={i} className={cn("px-3 py-2.5 text-right text-xs tabular-nums", v === 0 ? "text-muted-foreground/30" : "text-foreground")}>
                    {v || "—"}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right">
                  <div className="inline-flex">{trendIcon(row.perMonth)}</div>
                </td>
              </tr>
            ))}
            <tr className="border-t border-border/30 bg-card/30">
              <td className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-foreground">Total</td>
              {monthTotals.map((v, i) => (
                <td key={i} className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-foreground">{v}</td>
              ))}
              <td className="px-3 py-2.5 text-right">
                <div className="inline-flex">{trendIcon(monthTotals)}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter a MonthBreakdown to only the given rep IDs, recomputing totals.
// Pass null to get the full unfiltered breakdown.
// ---------------------------------------------------------------------------

export function filterBreakdownByReps(
  month: MonthBreakdown,
  repIds: Set<string> | null
): MonthBreakdown {
  if (!repIds) return month;
  const reps = month.reps.filter((r) => repIds.has(r.rep_id));
  const totals_by_funnel: Record<string, Counts> = {};
  const grand: Counts = { total: 0, active: 0, canceled: 0 };
  for (const r of reps) {
    for (const [funnel, c] of Object.entries(r.funnels)) {
      if (!totals_by_funnel[funnel]) totals_by_funnel[funnel] = { total: 0, active: 0, canceled: 0 };
      totals_by_funnel[funnel].total += c.total;
      totals_by_funnel[funnel].active += c.active;
      totals_by_funnel[funnel].canceled += c.canceled;
    }
    grand.total += r.totals.total;
    grand.active += r.totals.active;
    grand.canceled += r.totals.canceled;
  }
  return { ...month, reps, totals_by_funnel, grand_totals: grand };
}

// ---------------------------------------------------------------------------
// Data hook — fetches one or many months of breakdown data
// ---------------------------------------------------------------------------

export function useFunnelBreakdown(months: string[]) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = months.join(",");

  useEffect(() => {
    if (months.length === 0) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("months", key);
    fetch(`/api/meetings/funnel-breakdown?${params.toString()}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((json: ApiResponse) => { if (!cancelled) setData(json); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error };
}

export type { MonthBreakdown, RepBreakdown, Counts, ApiResponse };
