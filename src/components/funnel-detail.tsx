"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  X,
  Users,
  DollarSign,
  TrendingUp,
  Clock,
  ShoppingCart,
  Package,
  Loader2,
  Zap,
  ChevronDown,
  ChevronUp,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FunnelDetailProps {
  funnelId: string;
  funnelName: string;
  onClose: () => void;
  onContactClick?: (contactId: string) => void;
}

interface FunnelContact {
  email: string;
  name: string;
  contact_id: string | null;
  opted_in: string;
  status: "purchased_after" | "purchased_before" | "never_purchased";
  first_purchase_after: {
    product: string;
    amount: number;
    date: string;
    days_after: number;
  } | null;
  total_spend_after: number;
  total_spend_before: number;
}

interface ContactsCounts {
  all: number;
  purchased_after: number;
  purchased_before: number;
  never_purchased: number;
}

interface ContactsPagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

interface FunnelContactsData {
  contacts: FunnelContact[];
  counts: ContactsCounts;
  pagination: ContactsPagination;
}

interface ProductBreakdown {
  name: string;
  count: number;
  buyers?: number;
  revenue: number;
}

interface RecentPurchaser {
  email: string;
  product: string;
  amount: number;
  charge_date: string;
  days_after: number;
}

interface CommonPath {
  name: string;
  count: number;
  pct: number;
}

interface FunnelDetailData {
  funnel: { id: string; name: string; funnel_type: string };
  summary: {
    total_optins: number;
    purchased_after: number;
    purchased_before: number;
    never_purchased: number;
    conversion_rate: number;
    total_revenue_after: number;
    first_time_buyers: number;
    repeat_buyers: number;
    avg_funnels_before_purchase?: number | null;
    touch_distribution?: Record<string, number>;
    common_paths?: CommonPath[];
  };
  products_after: ProductBreakdown[];
  products_before: ProductBreakdown[];
  speed: {
    avg_days: number | null;
    median_days: number | null;
    distribution: Record<string, number>;
  };
  recent_purchasers?: RecentPurchaser[];
  computed_at?: string;
}

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

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });

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

const PRODUCT_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#3b82f6",
  "#ef4444", "#a855f7", "#14b8a6", "#f97316",
];

const SPEED_BUCKET_ORDER = [
  "0-7 days",
  "8-14 days",
  "15-30 days",
  "31-60 days",
  "61-90 days",
  "90+ days",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  purchased_after:  { bg: "bg-green-500/15", text: "text-green-400", label: "Purchased After" },
  purchased_before: { bg: "bg-blue-500/15",  text: "text-blue-400",  label: "Already Customer" },
  never_purchased:  { bg: "bg-zinc-500/15",  text: "text-zinc-400",  label: "Never Purchased" },
};

type ContactStatusFilter = "all" | "purchased_after" | "purchased_before";

const CONTACT_FILTER_TABS: { key: ContactStatusFilter; label: string; color: string }[] = [
  { key: "all",               label: "All",              color: "text-foreground" },
  { key: "purchased_after",   label: "Purchased After",  color: "text-green-400" },
  { key: "purchased_before",  label: "Already Customers", color: "text-blue-400" },
];

export function FunnelDetail({ funnelId, funnelName, onClose, onContactClick }: FunnelDetailProps) {
  const [data, setData] = useState<FunnelDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Contacts section state
  const [showContacts, setShowContacts] = useState(false);
  const [contactsData, setContactsData] = useState<FunnelContactsData | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsFilter, setContactsFilter] = useState<ContactStatusFilter>("all");
  const [contactsSearch, setContactsSearch] = useState("");
  const [contactsPage, setContactsPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/funnels/${funnelId}/detail`);
      if (!res.ok) {
        setError("Failed to load funnel details");
        return;
      }
      const json: FunnelDetailData = await res.json();
      setData(json);
    } catch (err) {
      console.error("[FunnelDetail] fetch:", err);
      setError("Failed to load funnel details");
    } finally {
      setLoading(false);
    }
  }, [funnelId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Fetch contacts when panel is open or filter/search/page changes
  const fetchContacts = useCallback(async () => {
    if (!showContacts) return;
    setContactsLoading(true);
    try {
      const params = new URLSearchParams({
        status: contactsFilter,
        page: String(contactsPage),
        per_page: "50",
        search: contactsSearch,
      });
      const res = await fetch(`/api/funnels/${funnelId}/contacts?${params}`);
      if (!res.ok) return;
      const json: FunnelContactsData = await res.json();
      setContactsData(json);
    } catch (err) {
      console.error("[FunnelDetail] contacts fetch:", err);
    } finally {
      setContactsLoading(false);
    }
  }, [funnelId, showContacts, contactsFilter, contactsPage, contactsSearch]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setContactsSearch(searchInput);
      setContactsPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const summary = data?.summary;
  const total = summary
    ? summary.purchased_after + summary.purchased_before + summary.never_purchased
    : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-[520px] flex-col border-l border-border bg-background shadow-2xl shadow-black/20">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
              <ShoppingCart className="h-5 w-5 text-purple-400" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {funnelName}
              </h2>
              {data?.funnel?.funnel_type && (
                <span
                  className={cn(
                    "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                    FUNNEL_TYPE_COLORS[data.funnel.funnel_type] ||
                      "bg-zinc-500/15 text-zinc-400"
                  )}
                >
                  {FUNNEL_TYPE_LABELS[data.funnel.funnel_type] ||
                    data.funnel.funnel_type}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader2 className="h-7 w-7 animate-spin text-purple-400" />
              <p className="mt-3 text-xs font-medium text-muted-foreground">
                Analyzing funnel data...
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground/60">
                Pulling contact data from HubSpot
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-24">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : data && summary ? (
            <div className="space-y-5 p-5">
              {/* ---- Summary Stats ---- */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                  <Users className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                  <div className="text-lg font-bold text-foreground">
                    {fmtNumber(summary.total_optins)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Total Opt-ins</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                  <TrendingUp className="mx-auto mb-1 h-4 w-4 text-green-400/70" />
                  <div className="text-lg font-bold text-green-400">
                    {fmtNumber(summary.purchased_after)}
                  </div>
                  <div className="text-[10px] text-green-400/70">
                    Purchased After ({fmtPercent(summary.conversion_rate)})
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                  <DollarSign className="mx-auto mb-1 h-4 w-4 text-green-400/70" />
                  <div className="text-lg font-bold text-green-400">
                    {fmtCurrency(summary.total_revenue_after)}
                  </div>
                  <div className="text-[10px] text-green-400/70">Post-Opt-in Revenue</div>
                </div>
              </div>

              {/* ---- Entry Point / New Customer Metric ---- */}
              {(summary.first_time_buyers > 0 || summary.repeat_buyers > 0) && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.03] p-4">
                  <h3 className="mb-2 text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Zap className="h-3 w-3" />
                    Entry Point — New Customers
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-lg font-bold text-amber-400">
                        {fmtNumber(summary.first_time_buyers)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        First-time buyers — this was their gateway into Think Media
                      </div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-foreground">
                        {fmtNumber(summary.repeat_buyers)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Repeat buyers — already customers who bought again
                      </div>
                    </div>
                  </div>
                  {summary.purchased_after > 0 && (
                    <div className="mt-2 text-[10px] text-muted-foreground/60">
                      {Math.round((summary.first_time_buyers / summary.purchased_after) * 100)}% of post-opt-in purchasers were brand new customers
                    </div>
                  )}
                </div>
              )}

              {/* ---- Multi-Touch Path Analysis ---- */}
              {summary.avg_funnels_before_purchase != null && summary.avg_funnels_before_purchase > 0 && (
                <div className="rounded-lg border border-purple-500/30 bg-purple-500/[0.03] p-4">
                  <h3 className="mb-3 text-xs font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Package className="h-3 w-3" />
                    Multi-Touch Journey
                  </h3>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <div className="text-lg font-bold text-purple-400">
                        {summary.avg_funnels_before_purchase?.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Avg funnels before purchase
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1">Touch distribution</div>
                      {summary.touch_distribution && (() => {
                        const maxVal = Math.max(1, ...Object.values(summary.touch_distribution));
                        return Object.entries(summary.touch_distribution).map(([bucket, count]) => (
                          <div key={bucket} className="flex items-center gap-2 mb-0.5">
                            <span className="w-16 text-[9px] text-muted-foreground/70 text-right">{bucket}</span>
                            <div className="flex-1 h-2.5 rounded-full bg-card/30 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-purple-500/50"
                                style={{ width: `${(count / maxVal) * 100}%` }}
                              />
                            </div>
                            <span className="w-6 text-[9px] text-muted-foreground tabular-nums text-right">{count}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Common co-occurring funnels */}
                  {(summary.common_paths?.length ?? 0) > 0 && (
                    <div className="mt-3 pt-3 border-t border-purple-500/10">
                      <div className="text-[10px] text-muted-foreground mb-2">
                        Other funnels these purchasers went through:
                      </div>
                      <div className="space-y-1">
                        {(summary.common_paths || []).slice(0, 8).map((p) => (
                          <div key={p.name} className="flex items-center gap-2">
                            <div className="flex-1 text-[10px] text-foreground/80 truncate">{p.name}</div>
                            <span className="text-[9px] text-purple-400 tabular-nums shrink-0">{p.pct}%</span>
                            <span className="text-[9px] text-muted-foreground/50 tabular-nums shrink-0">{p.count} people</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ---- Breakdown Bar ---- */}
              <div className="rounded-lg border border-border/50 bg-card/20 p-4">
                <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Opt-in Breakdown
                </h3>
                {total > 0 && (
                  <>
                    <div className="flex h-5 w-full overflow-hidden rounded-full">
                      {summary.purchased_after > 0 && (
                        <div
                          className="bg-green-500 transition-all"
                          style={{
                            width: `${(summary.purchased_after / total) * 100}%`,
                          }}
                        />
                      )}
                      {summary.purchased_before > 0 && (
                        <div
                          className="bg-blue-500 transition-all"
                          style={{
                            width: `${(summary.purchased_before / total) * 100}%`,
                          }}
                        />
                      )}
                      {summary.never_purchased > 0 && (
                        <div
                          className="bg-zinc-600 transition-all"
                          style={{
                            width: `${(summary.never_purchased / total) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                        <span className="text-muted-foreground">
                          Purchased After
                        </span>
                        <span className="font-medium text-foreground">
                          {fmtNumber(summary.purchased_after)} ({fmtPercent((summary.purchased_after / total) * 100)})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                        <span className="text-muted-foreground">
                          Already Customers
                        </span>
                        <span className="font-medium text-foreground">
                          {fmtNumber(summary.purchased_before)} ({fmtPercent((summary.purchased_before / total) * 100)})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-600" />
                        <span className="text-muted-foreground">
                          Never Purchased
                        </span>
                        <span className="font-medium text-foreground">
                          {fmtNumber(summary.never_purchased)} ({fmtPercent((summary.never_purchased / total) * 100)})
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* ---- What They Bought After ---- */}
              {(data.products_after?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-border/50 bg-card/20 p-4">
                  <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    What They Bought After
                  </h3>
                  <div className="space-y-2">
                    {(data.products_after || []).map((p, i) => (
                      <div
                        key={p.name}
                        className="flex items-center justify-between rounded-md bg-card/30 px-3 py-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                PRODUCT_COLORS[i % PRODUCT_COLORS.length],
                            }}
                          />
                          <span className="truncate text-xs font-medium text-foreground">
                            {p.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs tabular-nums">
                          {p.buyers != null && (
                            <span className="text-foreground font-medium">
                              {fmtNumber(p.buyers)} {p.buyers === 1 ? "person" : "people"}
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            {fmtNumber(p.count)} txns
                          </span>
                          <span className="font-medium text-green-400">
                            {fmtCurrency(p.revenue)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- What They Already Owned ---- */}
              {(data.products_before?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-border/50 bg-card/20 p-4">
                  <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    What They Already Owned
                  </h3>
                  <p className="mb-3 text-[10px] text-muted-foreground/60">
                    These people had already purchased before opting in
                  </p>
                  <div className="space-y-2">
                    {(data.products_before || []).map((p, i) => (
                      <div
                        key={p.name}
                        className="flex items-center justify-between rounded-md bg-card/20 px-3 py-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full opacity-50"
                            style={{
                              backgroundColor:
                                PRODUCT_COLORS[i % PRODUCT_COLORS.length],
                            }}
                          />
                          <span className="truncate text-xs font-medium text-muted-foreground">
                            {p.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs tabular-nums">
                          {p.buyers != null && (
                            <span className="text-muted-foreground">
                              {fmtNumber(p.buyers)} {p.buyers === 1 ? "person" : "people"}
                            </span>
                          )}
                          <span className="text-muted-foreground/60">
                            {fmtNumber(p.count)} txns
                          </span>
                          <span className="font-medium text-muted-foreground">
                            {fmtCurrency(p.revenue)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- Speed to Purchase ---- */}
              {data.speed?.avg_days !== null && data.speed?.avg_days !== undefined && (
                <div className="rounded-lg border border-border/50 bg-card/20 p-4">
                  <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Speed to Purchase
                  </h3>

                  {/* Avg + Median */}
                  <div className="mb-4 flex gap-4">
                    <div className="flex items-center gap-2 rounded-md bg-card/40 px-3 py-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-bold text-foreground">
                          {data.speed?.avg_days}d
                        </div>
                        <div className="text-[10px] text-muted-foreground">Avg</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-md bg-card/40 px-3 py-2">
                      <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-bold text-foreground">
                          {data.speed?.median_days}d
                        </div>
                        <div className="text-[10px] text-muted-foreground">Median</div>
                      </div>
                    </div>
                  </div>

                  {/* Distribution bars */}
                  <div className="space-y-1.5">
                    {(() => {
                      const maxVal = Math.max(
                        ...Object.values(data.speed?.distribution || {}),
                        1
                      );
                      return SPEED_BUCKET_ORDER.map((bucket) => {
                        const count = (data.speed?.distribution || {})[bucket] || 0;
                        const pct = (count / maxVal) * 100;
                        return (
                          <div key={bucket} className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">
                              {bucket}
                            </span>
                            <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-card/40">
                              <div
                                className="absolute inset-y-0 left-0 rounded-sm bg-purple-500/60"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-6 shrink-0 text-right text-[10px] font-medium tabular-nums text-foreground">
                              {count}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* ---- Recent Purchasers ---- */}
              {(data.recent_purchasers?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-border/50 bg-card/20 p-4">
                  <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Recent Purchasers
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-border/30 text-left text-muted-foreground">
                          <th className="pb-2 pr-2 font-medium">Email</th>
                          <th className="pb-2 pr-2 font-medium">Product</th>
                          <th className="pb-2 pr-2 text-right font-medium">Amount</th>
                          <th className="pb-2 pr-2 text-right font-medium">Date</th>
                          <th className="pb-2 text-right font-medium">Days After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.recent_purchasers || []).map((p, i) => (
                          <tr
                            key={`${p.email}-${i}`}
                            className="border-b border-border/10"
                          >
                            <td className="max-w-[140px] truncate py-1.5 pr-2 text-foreground">
                              {p.email}
                            </td>
                            <td className="max-w-[100px] truncate py-1.5 pr-2 text-muted-foreground">
                              {p.product}
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-green-400">
                              {fmtCurrency(p.amount)}
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                              {fmtDate(p.charge_date)}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                              {p.days_after}d
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ---- View Contacts Button / Section ---- */}
              <div className="rounded-lg border border-border/50 bg-card/20">
                <button
                  onClick={() => setShowContacts((prev) => !prev)}
                  className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-card/30 transition-colors rounded-lg"
                >
                  <span className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    View Contacts
                  </span>
                  {showContacts ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {showContacts && (
                  <div className="border-t border-border/50 px-4 pb-4">
                    {/* Filter Tabs */}
                    <div className="flex flex-wrap gap-1.5 py-3">
                      {CONTACT_FILTER_TABS.map((tab) => {
                        const count = contactsData?.counts?.[tab.key] ?? 0;
                        const isActive = contactsFilter === tab.key;
                        return (
                          <button
                            key={tab.key}
                            onClick={() => {
                              setContactsFilter(tab.key);
                              setContactsPage(1);
                            }}
                            className={cn(
                              "rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
                              isActive
                                ? tab.key === "all"
                                  ? "bg-foreground/10 text-foreground"
                                  : tab.key === "purchased_after"
                                  ? "bg-green-500/20 text-green-400"
                                  : tab.key === "purchased_before"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "bg-zinc-500/20 text-zinc-400"
                                : "bg-card/30 text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {tab.label} ({fmtNumber(count)})
                          </button>
                        );
                      })}
                    </div>

                    {/* Search */}
                    <div className="relative mb-3">
                      <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
                      <input
                        type="text"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search by name or email..."
                        className="w-full rounded-md border border-border/50 bg-card/30 py-1.5 pl-7 pr-3 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
                      />
                    </div>

                    {/* Contact List */}
                    {contactsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                      </div>
                    ) : contactsData && contactsData.contacts.length > 0 ? (
                      <>
                        <div className="space-y-1.5">
                          {contactsData.contacts.map((c, i) => {
                            const badge = STATUS_BADGE[c.status] || STATUS_BADGE.never_purchased;
                            return (
                              <div
                                key={`${c.email}-${i}`}
                                className="rounded-md bg-card/30 px-3 py-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    {c.contact_id && onContactClick ? (
                                      <button
                                        onClick={() => onContactClick(c.contact_id!)}
                                        className="text-xs font-medium text-foreground hover:text-purple-400 transition-colors text-left truncate block"
                                      >
                                        {c.name || c.email}
                                      </button>
                                    ) : (
                                      <span className="text-xs font-medium text-foreground truncate block">
                                        {c.name || c.email}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-muted-foreground truncate block">
                                      {c.email}
                                    </span>
                                  </div>
                                  <span
                                    className={cn(
                                      "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium",
                                      badge.bg,
                                      badge.text
                                    )}
                                  >
                                    {badge.label}
                                  </span>
                                </div>

                                {/* First Purchase + Total Spend */}
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                                  {c.first_purchase_after && (
                                    <span>
                                      <span className="text-green-400/80">
                                        {c.first_purchase_after.product}
                                      </span>
                                      {" "}
                                      {fmtCurrency(c.first_purchase_after.amount)}
                                      {" "}
                                      <span className="text-muted-foreground/60">
                                        ({c.first_purchase_after.days_after}d after)
                                      </span>
                                    </span>
                                  )}
                                  {c.total_spend_after > 0 && (
                                    <span>
                                      Total: <span className="text-green-400">{fmtCurrency(c.total_spend_after)}</span>
                                    </span>
                                  )}
                                  {c.total_spend_before > 0 && (
                                    <span>
                                      Prior: <span className="text-blue-400">{fmtCurrency(c.total_spend_before)}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Pagination */}
                        {contactsData.pagination.total_pages > 1 && (
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">
                              Page {contactsData.pagination.page} of {contactsData.pagination.total_pages}
                              {" "}({fmtNumber(contactsData.pagination.total)} contacts)
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setContactsPage((p) => Math.max(1, p - 1))}
                                disabled={contactsData.pagination.page <= 1}
                                className="rounded p-1 text-muted-foreground hover:bg-card/40 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setContactsPage((p) => Math.min(contactsData!.pagination.total_pages, p + 1))}
                                disabled={contactsData.pagination.page >= contactsData.pagination.total_pages}
                                className="rounded p-1 text-muted-foreground hover:bg-card/40 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="py-6 text-center text-[11px] text-muted-foreground">
                        No contacts found
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
