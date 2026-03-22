"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  X,
  DollarSign,
  TrendingUp,
  RotateCcw,
  Hash,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RepCharge {
  id: string;
  amount: number;
  charge_date: string;
  product_variant: string;
  source_platform: string;
  payment_plan_type: string | null;
  is_new: boolean;
  product_group: string;
  contacts: { id: string; full_name: string; email: string } | null;
  products: { short_name: string; group_name: string | null } | null;
}

interface RepChargesData {
  charges: RepCharge[];
  rep: { id: string; name: string; rep_type: string } | null;
  summary: {
    total: number;
    new_revenue: number;
    recurring_revenue: number;
    deal_count: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const platformStyles: Record<string, { label: string; bg: string; text: string }> = {
  samcart: { label: "SamCart", bg: "bg-blue-500/15", text: "text-blue-400" },
  kajabi: { label: "Kajabi", bg: "bg-purple-500/15", text: "text-purple-400" },
  hubspot: { label: "HubSpot", bg: "bg-amber-500/15", text: "text-amber-400" },
  hubspot_payments: { label: "HS Pay", bg: "bg-emerald-500/15", text: "text-emerald-400" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RepChargesModalProps {
  repId: string;
  repName: string;
  month?: string; // YYYY-MM
  onClose: () => void;
}

export function RepChargesModal({ repId, repName, month, onClose }: RepChargesModalProps) {
  const [data, setData] = useState<RepChargesData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      const res = await fetch(`/api/sales-reps/${repId}/charges?${params}`);
      if (!res.ok) return;
      setData(await res.json());
    } catch (err) {
      console.error("[RepChargesModal] fetch:", err);
    } finally {
      setLoading(false);
    }
  }, [repId, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const monthLabel = month
    ? new Date(month + "-15").toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "All Time";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[5vh]">
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{repName}</h2>
            <p className="text-xs text-muted-foreground">
              {monthLabel} — Attributed Transactions
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-3 border-b border-border px-5 py-4">
              <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5 text-center">
                <DollarSign className="mx-auto h-3.5 w-3.5 text-emerald-400" />
                <div className="mt-1 text-sm font-semibold text-emerald-400">{fmtCurrency(data.summary.total)}</div>
                <div className="text-[10px] text-muted-foreground">Total</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5 text-center">
                <TrendingUp className="mx-auto h-3.5 w-3.5 text-blue-400" />
                <div className="mt-1 text-sm font-semibold text-blue-400">{fmtCurrency(data.summary.new_revenue)}</div>
                <div className="text-[10px] text-muted-foreground">New Revenue</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5 text-center">
                <RotateCcw className="mx-auto h-3.5 w-3.5 text-purple-400" />
                <div className="mt-1 text-sm font-semibold text-purple-400">{fmtCurrency(data.summary.recurring_revenue)}</div>
                <div className="text-[10px] text-muted-foreground">Recurring</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5 text-center">
                <Hash className="mx-auto h-3.5 w-3.5 text-foreground" />
                <div className="mt-1 text-sm font-semibold text-foreground">{data.summary.deal_count}</div>
                <div className="text-[10px] text-muted-foreground">New Deals</div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {data.charges.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No attributed transactions for this period
                </p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/20">
                      <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                      <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</th>
                      <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                      <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                      <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Platform</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.charges.map((c) => {
                      const plat = platformStyles[c.source_platform] || { label: c.source_platform, bg: "bg-muted", text: "text-muted-foreground" };
                      return (
                        <tr key={c.id} className="border-b border-border/10 hover:bg-card/20">
                          <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(c.charge_date)}</td>
                          <td className="px-2 py-2 text-xs font-medium text-foreground">{c.contacts?.full_name || "—"}</td>
                          <td className="px-2 py-2 text-xs text-foreground">{c.products?.short_name || c.product_variant || "—"}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-medium text-foreground">{fmtCurrency(c.amount)}</td>
                          <td className="px-2 py-2 text-center">
                            <span className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                              c.is_new ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"
                            )}>
                              {c.is_new ? "New" : "Recurring"}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-medium", plat.bg, plat.text)}>
                              {plat.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">Failed to load data</p>
        )}
      </div>
    </div>
  );
}
