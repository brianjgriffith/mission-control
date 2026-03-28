"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  GitBranch,
  Import,
  Users,
  Loader2,
  DollarSign,
  TrendingUp,
  Clock,
  Search,
  ChevronUp,
  ChevronDown,
  Filter,
  Hash,
  Package,
} from "lucide-react";
import { FunnelImport } from "@/components/funnel-import";
import { FunnelDetail } from "@/components/funnel-detail";
import { ContactDetail } from "@/components/contact-detail";
import { ProductJourney } from "@/components/product-journey";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FunnelPerformance {
  funnel_id: string;
  funnel_name: string;
  funnel_type: string;
  hubspot_list_id: string;
  total_optins: number;
  purchased_after: number;
  purchased_before: number;
  never_purchased: number;
  conversion_rate: number;
  revenue_after: number;
  avg_days_to_purchase: number;
  first_time_buyers: number;
  repeat_buyers: number;
  computed_at?: string;
}

type SortKey =
  | "funnel_name"
  | "funnel_type"
  | "total_optins"
  | "purchased_after"
  | "purchased_before"
  | "revenue_after"
  | "avg_days_to_purchase"
  | "first_time_buyers";

type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtNumber = (n: number) => new Intl.NumberFormat("en-US").format(n);

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const fmtPercent = (n: number) => `${n.toFixed(1)}%`;

const FUNNEL_TYPE_COLORS: Record<string, string> = {
  web_class: "bg-blue-500/15 text-blue-400",
  funnel: "bg-purple-500/15 text-purple-400",
  lead_magnet: "bg-amber-500/15 text-amber-400",
  event: "bg-emerald-500/15 text-emerald-400",
};

const FUNNEL_TYPE_LABELS: Record<string, string> = {
  web_class: "Web Class",
  funnel: "Funnel",
  lead_magnet: "Lead Magnet",
  event: "Event",
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "web_class", label: "Web Class" },
  { value: "funnel", label: "Funnel" },
  { value: "lead_magnet", label: "Lead Magnet" },
  { value: "event", label: "Event" },
];

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  valueColor,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
      <div className="mb-1 flex items-center justify-center">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={cn("text-lg font-bold", valueColor || "text-foreground")}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Journeys View
// ---------------------------------------------------------------------------

export function JourneysView() {
  const [importOpen, setImportOpen] = useState(false);
  const [funnels, setFunnels] = useState<FunnelPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("total_optins");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedFunnel, setSelectedFunnel] = useState<{ id: string; name: string } | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedProductGroup, setSelectedProductGroup] = useState<string | null>(null);

  const fetchPerformance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/funnels/performance");
      if (!res.ok) {
        setFunnels([]);
        return;
      }
      const json = await res.json();
      setFunnels(json.funnels || []);
    } catch (err) {
      console.error("[JourneysView] fetch:", err);
      setFunnels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPerformance();
  }, [fetchPerformance]);

  // Sorting
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="inline h-3 w-3" />
    ) : (
      <ChevronDown className="inline h-3 w-3" />
    );
  };

  // Filtered + sorted data
  const filtered = useMemo(() => {
    let list = funnels;
    if (typeFilter !== "all") {
      list = list.filter((f) => f.funnel_type === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.funnel_name.toLowerCase().includes(q));
    }
    const sorted = [...list].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
    return sorted;
  }, [funnels, typeFilter, search, sortKey, sortDir]);

  // Summary stats
  const summary = useMemo(() => {
    if (funnels.length === 0)
      return {
        totalFunnels: 0,
        avgConversion: 0,
        totalRevenue: 0,
        avgDays: 0,
      };
    const totalRevenue = funnels.reduce((s, f) => s + f.revenue_after, 0);
    const avgConversion =
      funnels.reduce((s, f) => s + f.conversion_rate, 0) / funnels.length;
    const funnelsWithDays = funnels.filter((f) => f.avg_days_to_purchase > 0);
    const avgDays =
      funnelsWithDays.length > 0
        ? funnelsWithDays.reduce((s, f) => s + f.avg_days_to_purchase, 0) /
          funnelsWithDays.length
        : 0;
    return {
      totalFunnels: funnels.length,
      avgConversion,
      totalRevenue,
      avgDays,
    };
  }, [funnels]);

  // Conversion rate color
  const conversionColor = (rate: number) => {
    if (rate >= 10) return "text-green-400";
    if (rate >= 5) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
            <GitBranch className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Funnel Performance</h1>
            <p className="text-xs text-muted-foreground">
              Track opt-in to purchase conversion across all funnels
            </p>
          </div>
        </div>

        <button
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-700"
        >
          <Import className="h-3.5 w-3.5" />
          Import Funnels
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          /* ---- Loading State ---- */
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">
              Analyzing funnels...
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Pulling contact data from HubSpot — this may take a moment
            </p>
          </div>
        ) : funnels.length === 0 ? (
          /* ---- Empty State ---- */
          <div className="rounded-xl border border-dashed border-border/60 bg-card/10 py-12 text-center">
            <GitBranch className="mx-auto h-10 w-10 text-muted-foreground/20" />
            <p className="mt-3 text-sm text-muted-foreground">
              No funnels imported yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Click &quot;Import Funnels&quot; to pull funnel lists from HubSpot
            </p>
            <button
              onClick={() => setImportOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Import className="h-3 w-3" />
              Import from HubSpot
            </button>
          </div>
        ) : (
          <>
            {/* ---- Summary Stat Cards ---- */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={Hash}
                label="Total Funnels"
                value={fmtNumber(summary.totalFunnels)}
              />
              <StatCard
                icon={TrendingUp}
                label="Avg Conversion Rate"
                value={fmtPercent(summary.avgConversion)}
                valueColor={conversionColor(summary.avgConversion)}
              />
              <StatCard
                icon={DollarSign}
                label="Post-Opt-in Revenue"
                value={fmtCurrency(summary.totalRevenue)}
                valueColor="text-green-400"
              />
              <StatCard
                icon={Clock}
                label="Avg Days to Purchase"
                value={
                  summary.avgDays > 0 ? `${Math.round(summary.avgDays)}d` : "--"
                }
              />
            </div>

            {/* ---- Product Journey Buttons ---- */}
            <div className="mb-6 rounded-lg border border-border/50 bg-card/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-4 w-4 text-purple-400" />
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Product Journey Analysis
                </h3>
              </div>
              <p className="text-[11px] text-muted-foreground/60 mb-3">
                Trace buyer paths — see which funnels leads went through before purchasing each product.
              </p>
              <div className="flex flex-wrap gap-2">
                {["Accelerator", "VRA Elite", "Video Ranking Academy"].map((group) => (
                  <button
                    key={group}
                    onClick={() => setSelectedProductGroup(group)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-card/30 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-purple-600/15 hover:text-purple-300 hover:border-purple-500/30"
                  >
                    <GitBranch className="h-3 w-3" />
                    {group}
                  </button>
                ))}
              </div>
            </div>

            {/* ---- Filters ---- */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search funnels..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-full rounded-md border border-border/50 bg-card/30 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTypeFilter(opt.value)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                      typeFilter === opt.value
                        ? "bg-purple-600/20 text-purple-300"
                        : "text-muted-foreground hover:bg-card/40 hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ---- Performance Table ---- */}
            <div className="rounded-lg border border-border/50 bg-card/20 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/40 bg-card/30 text-left text-muted-foreground">
                      <th
                        className="cursor-pointer px-4 py-2.5 font-medium hover:text-foreground"
                        onClick={() => handleSort("funnel_name")}
                      >
                        Funnel Name <SortIcon col="funnel_name" />
                      </th>
                      <th
                        className="cursor-pointer px-3 py-2.5 font-medium hover:text-foreground"
                        onClick={() => handleSort("funnel_type")}
                      >
                        Type <SortIcon col="funnel_type" />
                      </th>
                      <th
                        className="cursor-pointer px-3 py-2.5 text-right font-medium hover:text-foreground"
                        onClick={() => handleSort("total_optins")}
                      >
                        Opt-ins <SortIcon col="total_optins" />
                      </th>
                      <th
                        className="cursor-pointer px-3 py-2.5 text-right font-medium hover:text-foreground"
                        onClick={() => handleSort("purchased_after")}
                      >
                        Purchased After <SortIcon col="purchased_after" />
                      </th>
                      <th
                        className="cursor-pointer px-3 py-2.5 text-right font-medium hover:text-foreground"
                        onClick={() => handleSort("purchased_before")}
                      >
                        Already Customers{" "}
                        <SortIcon col="purchased_before" />
                      </th>
                      <th
                        className="cursor-pointer px-3 py-2.5 text-right font-medium hover:text-foreground"
                        onClick={() => handleSort("revenue_after")}
                      >
                        Revenue <SortIcon col="revenue_after" />
                      </th>
                      <th
                        className="cursor-pointer px-3 py-2.5 text-right font-medium hover:text-foreground"
                        onClick={() => handleSort("avg_days_to_purchase")}
                      >
                        Avg Days <SortIcon col="avg_days_to_purchase" />
                      </th>
                      <th
                        className="cursor-pointer px-3 py-2.5 text-right font-medium hover:text-foreground"
                        onClick={() => handleSort("first_time_buyers")}
                      >
                        New Customers <SortIcon col="first_time_buyers" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No funnels match your filters
                        </td>
                      </tr>
                    ) : (
                      filtered.map((f) => (
                        <tr
                          key={f.funnel_id}
                          className="border-b border-border/20 transition-colors hover:bg-card/30 cursor-pointer"
                          onClick={() => setSelectedFunnel({ id: f.funnel_id, name: f.funnel_name })}
                        >
                          <td className="max-w-[300px] truncate px-4 py-2.5 font-medium text-foreground">
                            {f.funnel_name}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                                FUNNEL_TYPE_COLORS[f.funnel_type] ||
                                  "bg-zinc-500/15 text-zinc-400"
                              )}
                            >
                              {FUNNEL_TYPE_LABELS[f.funnel_type] ||
                                f.funnel_type}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {fmtNumber(f.total_optins)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            <span className={conversionColor(f.conversion_rate)}>
                              {fmtNumber(f.purchased_after)}
                            </span>
                            <span className="ml-1 text-muted-foreground/60">
                              ({fmtPercent(f.conversion_rate)})
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {fmtNumber(f.purchased_before)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-green-400">
                            {f.revenue_after > 0
                              ? fmtCurrency(f.revenue_after)
                              : "--"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {f.avg_days_to_purchase > 0
                              ? `${Math.round(f.avg_days_to_purchase)}d`
                              : "--"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {f.first_time_buyers > 0 ? (
                              <span className="text-amber-400 font-medium">{fmtNumber(f.first_time_buyers)}</span>
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Row count */}
            <p className="mt-2 text-[10px] text-muted-foreground/50">
              Showing {filtered.length} of {funnels.length} funnels
            </p>
          </>
        )}
      </div>

      {/* Import Modal */}
      <FunnelImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={fetchPerformance}
      />

      {/* Funnel Detail Panel */}
      {selectedFunnel && (
        <FunnelDetail
          funnelId={selectedFunnel.id}
          funnelName={selectedFunnel.name}
          onClose={() => setSelectedFunnel(null)}
          onContactClick={(contactId) => setSelectedContactId(contactId)}
        />
      )}

      {selectedContactId && (
        <ContactDetail
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
        />
      )}

      {selectedProductGroup && (
        <ProductJourney
          productGroup={selectedProductGroup}
          onClose={() => setSelectedProductGroup(null)}
          onContactClick={(contactId) => setSelectedContactId(contactId)}
        />
      )}
    </div>
  );
}
