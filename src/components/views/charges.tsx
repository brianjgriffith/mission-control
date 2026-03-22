"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  DollarSign,
  Hash,
  TrendingUp,
  Package,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { UnmatchedManager } from "@/components/unmatched-manager";
import { ContactDetail } from "@/components/contact-detail";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChargeContact {
  id: string;
  full_name: string;
  email: string;
}

interface ChargeProduct {
  short_name: string;
  name: string;
  program: string;
}

interface ChargeAttribution {
  id: string;
  sales_rep_id: string;
  attribution_type: string;
  sales_reps: { id: string; name: string } | null;
}

interface SalesRep {
  id: string;
  name: string;
}

interface Charge {
  id: string;
  amount: number;
  raw_title: string;
  charge_date: string;
  source_platform: string;
  payment_plan_type: string;
  contacts: ChargeContact | null;
  products: ChargeProduct | null;
  charge_attributions: ChargeAttribution[] | null;
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

interface ByProductEntry {
  total: number;
  count: number;
}

interface ChargeSummary {
  total_revenue: number;
  total_charges: number;
  by_group: Record<string, number>;
  by_product: Record<string, number>;
  by_platform: Record<string, number>;
}

interface ChargesResponse {
  charges: Charge[];
  pagination: Pagination;
  summary: ChargeSummary;
}

interface MonthlyEntry {
  month: string;
  total: number;
  count: number;
  by_group: Record<string, number>;
}

interface TopGroup {
  name: string;
  total: number;
}

interface StatsProduct {
  name: string;
  short_name: string;
  group_name: string | null;
}

interface StatsResponse {
  monthly: MonthlyEntry[];
  top_groups: TopGroup[];
  products: Record<string, StatsProduct>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const fmtCurrencyShort = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (str: string) =>
  new Date(str).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(m, 10) - 1]} '${year.slice(2)}`;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const PRODUCT_COLORS = [
  "#89b4fa", "#a6e3a1", "#f9e2af", "#cba6f7", "#f38ba8",
  "#fab387", "#94e2d5", "#f5c2e7", "#89dceb", "#eba0ac",
];

const PLATFORM_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  samcart: { label: "SamCart", bg: "bg-blue-500/15", text: "text-blue-400" },
  kajabi: { label: "Kajabi", bg: "bg-purple-500/15", text: "text-purple-400" },
  hubspot: { label: "HubSpot", bg: "bg-amber-500/15", text: "text-amber-400" },
  hubspot_payments: { label: "HS Payments", bg: "bg-emerald-500/15", text: "text-emerald-400" },
};

function getPlatformStyle(platform: string) {
  const key = platform.toLowerCase();
  return PLATFORM_STYLES[key] ?? { label: platform, bg: "bg-muted", text: "text-muted-foreground" };
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
      <div className={cn("text-lg font-bold", valueColor || "text-foreground")}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ChargesView() {
  // Data state
  const [charges, setCharges] = useState<Charge[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 50, total: 0, total_pages: 0 });
  const [summary, setSummary] = useState<ChargesResponse["summary"] | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // Filter state
  const [month, setMonth] = useState(getCurrentMonth());
  const [groupFilter, setGroupFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [attributingChargeId, setAttributingChargeId] = useState<string | null>(null);
  const [repFilter, setRepFilter] = useState("");

  // -------------------------------------------------------------------------
  // Fetch stats (chart data)
  // -------------------------------------------------------------------------
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/charges/stats?months=12");
      if (!res.ok) return;
      const json: StatsResponse = await res.json();
      setStats(json);
    } catch (err) {
      console.error("[ChargesView] fetchStats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Fetch charges list
  // -------------------------------------------------------------------------
  const fetchCharges = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (month !== "all") params.set("month", month);
      if (groupFilter) params.set("group", groupFilter);
      if (productFilter) params.set("product_id", productFilter);
      if (platformFilter) params.set("source_platform", platformFilter);
      if (repFilter) params.set("rep_id", repFilter);
      if (searchQuery) params.set("search", searchQuery);
      params.set("page", String(page));
      params.set("per_page", "50");

      const res = await fetch(`/api/charges?${params.toString()}`);
      if (!res.ok) return;
      const json: ChargesResponse = await res.json();
      setCharges(json.charges ?? []);
      setPagination(json.pagination);
      setSummary(json.summary);
    } catch (err) {
      console.error("[ChargesView] fetchCharges:", err);
    } finally {
      setLoading(false);
    }
  }, [month, groupFilter, productFilter, platformFilter, repFilter, searchQuery, page]);

  // Fetch sales reps for attribution dropdown
  useEffect(() => {
    fetch("/api/sales-reps")
      .then((r) => r.json())
      .then((j) => setSalesReps(j.reps || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchCharges();
  }, [fetchCharges]);

  // Handle attribution
  const handleAttribute = useCallback(
    async (chargeId: string, salesRepId: string | null) => {
      try {
        await fetch(`/api/charges/${chargeId}/attribute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sales_rep_id: salesRepId }),
        });
        setAttributingChargeId(null);
        fetchCharges();
      } catch (err) {
        console.error("[ChargesView] attribute:", err);
      }
    },
    [fetchCharges]
  );

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [month, groupFilter, productFilter, platformFilter, repFilter, searchQuery]);

  // -------------------------------------------------------------------------
  // Chart data — grouped by product family
  // -------------------------------------------------------------------------
  const topGroupKeys = useMemo(() => {
    if (!stats) return [];
    return stats.top_groups.slice(0, 8).map((g) => g.name);
  }, [stats]);

  const chartData = useMemo(() => {
    if (!stats) return [];
    return stats.monthly.map((m) => {
      const row: Record<string, string | number> = { month: formatMonth(m.month) };
      let otherTotal = 0;
      for (const [group, amount] of Object.entries(m.by_group)) {
        if (topGroupKeys.includes(group)) {
          row[group] = amount;
        } else {
          otherTotal += amount;
        }
      }
      if (otherTotal > 0) row["Other"] = otherTotal;
      return row;
    });
  }, [stats, topGroupKeys]);

  const barKeys = useMemo(() => {
    const keys = [...topGroupKeys];
    if (chartData.some((d) => (d["Other"] as number) > 0)) {
      keys.push("Other");
    }
    return keys;
  }, [topGroupKeys, chartData]);

  // -------------------------------------------------------------------------
  // Revenue breakdown by product group
  // -------------------------------------------------------------------------
  const productBreakdown = useMemo(() => {
    if (!summary?.by_group) return [];
    const entries = Object.entries(summary.by_group).map(([name, revenue]) => ({
      name,
      revenue: Number(revenue) || 0,
    }));
    entries.sort((a, b) => b.revenue - a.revenue);
    const total = entries.reduce((s, e) => s + e.revenue, 0);
    return entries.map((e) => ({
      ...e,
      pct: total > 0 ? (e.revenue / total) * 100 : 0,
    }));
  }, [summary]);

  // -------------------------------------------------------------------------
  // Stat card values
  // -------------------------------------------------------------------------
  const totalRevenue = summary?.total_revenue ?? 0;
  const totalCharges = summary?.total_charges ?? 0;
  const avgCharge = totalCharges > 0 ? totalRevenue / totalCharges : 0;
  const topProduct = productBreakdown.length > 0 ? productBreakdown[0].name : "—";

  // -------------------------------------------------------------------------
  // Month options for picker
  // -------------------------------------------------------------------------
  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [
      { value: "all", label: "All Time" },
    ];
    if (stats?.monthly) {
      // Add months from stats in reverse chronological order
      const months = [...stats.monthly].reverse();
      for (const m of months) {
        options.push({ value: m.month, label: formatMonth(m.month) });
      }
    } else {
      // Fallback: generate last 12 months
      const now = new Date();
      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        options.push({ value: val, label: formatMonth(val) });
      }
    }
    return options;
  }, [stats]);

  // Product options from stats
  const productOptions = useMemo(() => {
    if (!stats?.products) return [];
    return Object.entries(stats.products).map(([id, p]) => ({
      value: id,
      label: p.short_name,
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [stats]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Charges & Revenue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Company-wide transaction ledger from HubSpot
          </p>
        </div>
        {/* Unmatched button */}
        {summary && summary.by_group?.Unmatched > 0 && (
          <button
            onClick={() => setUnmatchedOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {fmtCurrency(summary.by_group.Unmatched)} unmatched
          </button>
        )}

        {/* Stat Cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={DollarSign}
            label="Total Revenue"
            value={fmtCurrencyShort(totalRevenue)}
            valueColor="text-green-400"
          />
          <StatCard
            icon={Hash}
            label="Total Charges"
            value={totalCharges.toLocaleString()}
          />
          <StatCard
            icon={TrendingUp}
            label="Avg Charge"
            value={fmtCurrency(avgCharge)}
          />
          <StatCard
            icon={Package}
            label="Top Product"
            value={topProduct}
            valueColor="text-primary"
          />
        </div>

        {/* Monthly Revenue Chart + Product Breakdown */}
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          {/* Chart */}
          <div className="rounded-lg border border-border/50 bg-card/40 p-4 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Monthly Revenue</h2>
            {statsLoading ? (
              <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
                Loading chart...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3b3b54" opacity={0.5} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: "#9da5c0" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9da5c0" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1e1e2e",
                      border: "1px solid #313244",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={((v: number) => fmtCurrencyShort(v)) as any}
                    labelStyle={{ color: "#e2e8f8" }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                  />
                  {barKeys.map((key, i) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="revenue"
                      fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]}
                      radius={i === barKeys.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Revenue by Product Group */}
          <div className="rounded-lg border border-border/50 bg-card/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Revenue by Product Family</h2>
            {loading ? (
              <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
                Loading...
              </div>
            ) : productBreakdown.length === 0 ? (
              <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
                No data
              </div>
            ) : (
              <div className="space-y-2.5 overflow-y-auto" style={{ maxHeight: 240 }}>
                {productBreakdown.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{p.name}</span>
                    <span className="shrink-0 text-xs font-medium text-foreground">
                      {fmtCurrencyShort(p.revenue)}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground w-10 text-right">
                      {p.pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {/* Month picker */}
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Product family filter */}
          <select
            value={groupFilter}
            onChange={(e) => { setGroupFilter(e.target.value); setProductFilter(""); }}
            className="rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Families</option>
            {(stats?.top_groups || []).map((g) => (
              <option key={g.name} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>

          {/* Product filter */}
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Products</option>
            {productOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Platform filter */}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Platforms</option>
            <option value="hubspot">HubSpot Charges</option>
            <option value="hubspot_payments">HubSpot Payments</option>
            <option value="samcart">SamCart</option>
            <option value="kajabi">Kajabi</option>
          </select>

          {/* Sales Rep filter */}
          <select
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
            className="rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Reps</option>
            {salesReps.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>

          {/* Search */}
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search charges..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-md border border-border bg-card/40 py-1.5 pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring w-48"
            />
          </div>
        </div>

        {/* Charges Table */}
        <div className="rounded-lg border border-border/50 bg-card/40 overflow-hidden">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
              Loading charges...
            </div>
          ) : charges.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
              No charges found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/20 bg-card/20">
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Date
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Contact
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Product
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Amount
                    </th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Platform
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Sales Rep
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Payment Type
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((charge) => {
                    const platform = getPlatformStyle(charge.source_platform);
                    return (
                      <tr
                        key={charge.id}
                        className="border-b border-border/10 transition-colors hover:bg-card/20"
                      >
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(charge.charge_date)}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-medium">
                          {charge.contacts ? (
                            <button
                              onClick={() => setSelectedContactId(charge.contacts!.id)}
                              className="text-primary hover:text-primary/80 hover:underline text-left"
                            >
                              {charge.contacts.full_name}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {charge.products?.short_name ? (
                            <span className="text-foreground">{charge.products.short_name}</span>
                          ) : (
                            <span className="text-muted-foreground/50 italic">Unmatched</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs font-medium text-foreground">
                          {fmtCurrency(charge.amount)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                              platform.bg,
                              platform.text
                            )}
                          >
                            {platform.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {(() => {
                            const attr = charge.charge_attributions?.[0];
                            const repName = attr?.sales_reps?.name;
                            const isAttributing = attributingChargeId === charge.id;

                            if (isAttributing) {
                              return (
                                <select
                                  autoFocus
                                  defaultValue={attr?.sales_rep_id || ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleAttribute(charge.id, val || null);
                                  }}
                                  onBlur={() => setAttributingChargeId(null)}
                                  className="rounded border border-border bg-card/40 px-1.5 py-0.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                                >
                                  <option value="">None</option>
                                  {salesReps.map((r) => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                                </select>
                              );
                            }

                            if (repName) {
                              return (
                                <button
                                  onClick={() => setAttributingChargeId(charge.id)}
                                  className="text-foreground hover:text-primary hover:underline"
                                  title={`${attr?.attribution_type} attribution — click to change`}
                                >
                                  {repName}
                                </button>
                              );
                            }

                            return (
                              <button
                                onClick={() => setAttributingChargeId(charge.id)}
                                className="text-muted-foreground/40 hover:text-primary text-[10px]"
                              >
                                + Assign
                              </button>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">
                          {charge.payment_plan_type?.replace(/_/g, " ") ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
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

      {/* Unmatched Manager Modal */}
      <UnmatchedManager
        open={unmatchedOpen}
        onClose={() => setUnmatchedOpen(false)}
        onAssigned={() => {
          fetchCharges();
          fetchStats();
        }}
      />

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
