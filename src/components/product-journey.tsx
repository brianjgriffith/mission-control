"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  X,
  Users,
  GitBranch,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Search,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductJourneyProps {
  productGroup: string;
  onClose: () => void;
  onContactClick?: (contactId: string) => void;
}

interface ContactFunnel {
  name: string;
  date: string;
}

interface ContactJourney {
  contact_id: string;
  name: string;
  email: string;
  funnels_count: number;
  days_to_purchase: number | null;
  first_purchase_amount: number;
  first_purchase_date: string;
  funnels: ContactFunnel[];
}

interface TopFunnel {
  name: string;
  count: number;
  pct: number;
}

interface JourneyData {
  product_group: string;
  total_purchasers: number;
  with_funnel_paths: number;
  without_funnel_paths: number;
  avg_funnels: number;
  avg_days: number | null;
  median_days: number | null;
  touch_distribution: Record<string, number>;
  speed_distribution: Record<string, number>;
  top_funnels: TopFunnel[];
  contacts: ContactJourney[];
  total_contacts: number;
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

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

// ---------------------------------------------------------------------------
// Horizontal Bar
// ---------------------------------------------------------------------------

function HorizontalBar({
  label,
  value,
  maxValue,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">
        {label}
      </div>
      <div className="flex-1 h-5 rounded-sm bg-card/30 overflow-hidden relative">
        <div
          className={cn("h-full rounded-sm transition-all", color)}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <div className="w-8 shrink-0 text-right text-[11px] font-medium tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product Journey Panel
// ---------------------------------------------------------------------------

export function ProductJourney({
  productGroup,
  onClose,
  onContactClick,
}: ProductJourneyProps) {
  const [data, setData] = useState<JourneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [expandedContact, setExpandedContact] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const showActiveToggle = ["Accelerator", "VRA Elite"].includes(productGroup);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ group: productGroup });
      if (activeOnly) params.set("active", "true");
      const res = await fetch(`/api/products/journey?${params}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to load");
      }
      const json: JourneyData = await res.json();
      setData(json);
    } catch (err: any) {
      console.error("[ProductJourney] fetch:", err);
      setError(err.message || "Failed to load journey data");
    } finally {
      setLoading(false);
    }
  }, [productGroup, activeOnly]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter contacts by search
  const filteredContacts = useMemo(() => {
    if (!data?.contacts) return [];
    if (!search.trim()) return data.contacts;
    const q = search.toLowerCase();
    return data.contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [data?.contacts, search]);

  // Max values for bar charts
  const touchMax = useMemo(
    () =>
      data
        ? Math.max(...Object.values(data.touch_distribution), 1)
        : 1,
    [data]
  );
  const speedMax = useMemo(
    () =>
      data
        ? Math.max(...Object.values(data.speed_distribution), 1)
        : 1,
    [data]
  );

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
              <GitBranch className="h-5 w-5 text-purple-400" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {productGroup} Journey
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Buyer funnel paths analysis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
              <p className="mt-4 text-sm font-medium text-muted-foreground">
                Analyzing buyer journeys...
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Tracing funnel paths for {productGroup} purchasers
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={fetchData}
                className="mt-3 text-xs text-purple-400 hover:text-purple-300"
              >
                Retry
              </button>
            </div>
          ) : data ? (
            <div className="px-5 py-4 space-y-5">
              {/* Active toggle */}
              {showActiveToggle && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveOnly(false)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                      !activeOnly
                        ? "bg-purple-600/20 text-purple-300"
                        : "text-muted-foreground hover:bg-card/40 hover:text-foreground"
                    )}
                  >
                    All Purchasers
                  </button>
                  <button
                    onClick={() => setActiveOnly(true)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                      activeOnly
                        ? "bg-purple-600/20 text-purple-300"
                        : "text-muted-foreground hover:bg-card/40 hover:text-foreground"
                    )}
                  >
                    Active Only
                  </button>
                </div>
              )}

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                  <div className="mb-1 flex items-center justify-center">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-lg font-bold text-foreground">
                    {fmtNumber(data.total_purchasers)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Total Purchasers</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                  <div className="mb-1 flex items-center justify-center">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-lg font-bold text-purple-400">
                    {data.avg_funnels}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Avg Funnels Before Purchase</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                  <div className="mb-1 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-lg font-bold text-foreground">
                    {data.avg_days != null ? `${data.avg_days}d` : "--"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Avg Days to Purchase
                    {data.median_days != null && (
                      <span className="block text-muted-foreground/50">
                        median: {data.median_days}d
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Touch Distribution */}
              <div>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Funnel Touch Distribution
                </h3>
                <div className="space-y-1.5">
                  {Object.entries(data.touch_distribution).map(([label, value]) => (
                    <HorizontalBar
                      key={label}
                      label={label}
                      value={value}
                      maxValue={touchMax}
                      color="bg-purple-500/70"
                    />
                  ))}
                </div>
              </div>

              {/* Speed Distribution */}
              <div>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Speed to Purchase
                </h3>
                <div className="space-y-1.5">
                  {Object.entries(data.speed_distribution).map(([label, value]) => (
                    <HorizontalBar
                      key={label}
                      label={label}
                      value={value}
                      maxValue={speedMax}
                      color="bg-blue-500/70"
                    />
                  ))}
                </div>
              </div>

              {/* Top Funnels */}
              {data.top_funnels.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Top Funnels in the Path
                  </h3>
                  <div className="space-y-1">
                    {data.top_funnels.map((f) => (
                      <div
                        key={f.name}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-card/30"
                      >
                        <div className="flex-1 truncate text-foreground">
                          {f.name}
                        </div>
                        <span className="shrink-0 tabular-nums text-purple-400 font-medium">
                          {f.pct}%
                        </span>
                        <span className="shrink-0 w-10 text-right tabular-nums text-muted-foreground">
                          {f.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Individual Journeys */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Individual Journeys
                  </h3>
                  <span className="text-[10px] text-muted-foreground/50">
                    {filteredContacts.length} of {data.total_contacts}
                  </span>
                </div>

                {/* Search */}
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-full rounded-md border border-border/50 bg-card/30 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
                  />
                </div>

                {/* Table */}
                <div className="rounded-lg border border-border/50 bg-card/20 overflow-hidden">
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-border/40 bg-card/50 text-left text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-2 py-2 text-right font-medium">Funnels</th>
                          <th className="px-2 py-2 text-right font-medium">Days</th>
                          <th className="px-3 py-2 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredContacts.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-muted-foreground">
                              No contacts found
                            </td>
                          </tr>
                        ) : (
                          filteredContacts.map((c) => {
                            const isExpanded = expandedContact === c.contact_id;
                            return (
                              <ContactRow
                                key={c.contact_id}
                                contact={c}
                                isExpanded={isExpanded}
                                onToggle={() =>
                                  setExpandedContact(
                                    isExpanded ? null : c.contact_id
                                  )
                                }
                                onContactClick={onContactClick}
                              />
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Contact Row (with expandable funnel timeline)
// ---------------------------------------------------------------------------

function ContactRow({
  contact,
  isExpanded,
  onToggle,
  onContactClick,
}: {
  contact: ContactJourney;
  isExpanded: boolean;
  onToggle: () => void;
  onContactClick?: (contactId: string) => void;
}) {
  return (
    <>
      <tr
        className="border-b border-border/20 transition-colors hover:bg-card/30 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            {contact.funnels.length > 0 ? (
              isExpanded ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              )
            ) : (
              <span className="w-3" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onContactClick?.(contact.contact_id);
              }}
              className="truncate max-w-[140px] font-medium text-foreground hover:text-purple-400 transition-colors text-left"
            >
              {contact.name}
            </button>
          </div>
        </td>
        <td className="px-2 py-2 text-right tabular-nums text-purple-400 font-medium">
          {contact.funnels_count}
        </td>
        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
          {contact.days_to_purchase != null
            ? `${contact.days_to_purchase}d`
            : "--"}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-green-400">
          {fmtCurrency(contact.first_purchase_amount)}
        </td>
      </tr>

      {/* Expanded: funnel timeline */}
      {isExpanded && contact.funnels.length > 0 && (
        <tr>
          <td colSpan={4} className="bg-card/10 px-3 py-2">
            <div className="pl-5 space-y-1">
              {contact.funnels.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 text-[11px]"
                >
                  <div className="relative flex items-center">
                    <div className="h-2 w-2 rounded-full bg-purple-500/60" />
                    {i < contact.funnels.length - 1 && (
                      <div className="absolute left-[3px] top-2 h-4 w-0.5 bg-purple-500/20" />
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {f.date ? fmtDate(f.date) : "--"}
                  </span>
                  <span className="truncate text-foreground">{f.name}</span>
                </div>
              ))}
              {/* Purchase event */}
              <div className="flex items-center gap-2 text-[11px]">
                <div className="h-2 w-2 rounded-full bg-green-500/70" />
                <span className="text-muted-foreground">
                  {fmtDate(contact.first_purchase_date)}
                </span>
                <span className="text-green-400 font-medium">
                  Purchased {fmtCurrency(contact.first_purchase_amount)}
                </span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
