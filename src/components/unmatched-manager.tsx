"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  X,
  AlertTriangle,
  Check,
  Search,
  Package,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnmatchedGroup {
  title: string;
  charge_count: number;
  total_revenue: number;
  earliest: string;
  latest: string;
}

interface Product {
  id: string;
  name: string;
  short_name: string;
  group_name: string | null;
}

interface UnmatchedData {
  total_unmatched: number;
  total_revenue: number;
  groups: UnmatchedGroup[];
  products: Product[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const fmtNumber = (n: number) =>
  new Intl.NumberFormat("en-US").format(n);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface UnmatchedManagerProps {
  open: boolean;
  onClose: () => void;
  onAssigned?: () => void; // callback to refresh charges view
}

export function UnmatchedManager({ open, onClose, onAssigned }: UnmatchedManagerProps) {
  const [data, setData] = useState<UnmatchedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedTitle, setExpandedTitle] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/unmatched");
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("[UnmatchedManager] fetch:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  // Clear success message after 3s
  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  if (!open) return null;

  const filtered = (data?.groups || []).filter((g) =>
    search ? g.title.toLowerCase().includes(search.toLowerCase()) : true
  );

  // Group products by group_name for the dropdown
  const productsByGroup = new Map<string, Product[]>();
  for (const p of data?.products || []) {
    const group = p.group_name || "Other";
    if (!productsByGroup.has(group)) productsByGroup.set(group, []);
    productsByGroup.get(group)!.push(p);
  }

  const handleAssign = async (title: string) => {
    const productId = selectedProduct[title];
    if (!productId) return;

    setAssigning(title);
    try {
      const res = await fetch("/api/admin/unmatched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: title, product_id: productId }),
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("Assign failed:", err);
        return;
      }

      const result = await res.json();
      setSuccessMessage(
        `Assigned ${fmtNumber(result.charges_updated)} charges to product${result.mapping_created ? " + created mapping" : ""}`
      );

      // Refresh data
      await fetchData();
      onAssigned?.();
    } catch (err) {
      console.error("[UnmatchedManager] assign:", err);
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[5vh]">
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Unmatched Charges</h2>
            <p className="text-xs text-muted-foreground">
              {data
                ? `${fmtNumber(data.total_unmatched)} charges · ${fmtCurrency(data.total_revenue)} revenue`
                : "Loading..."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Success banner */}
        {successMessage && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            <Check className="h-3.5 w-3.5 shrink-0" />
            {successMessage}
          </div>
        )}

        {/* Search */}
        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search unmatched titles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-card/40 py-1.5 pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Package className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">
                {search ? "No matches found" : "All charges are matched!"}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((group) => {
                const isExpanded = expandedTitle === group.title;
                const isAssigning = assigning === group.title;

                return (
                  <div
                    key={group.title}
                    className="rounded-lg border border-border/40 bg-card/20"
                  >
                    {/* Row header */}
                    <button
                      onClick={() =>
                        setExpandedTitle(isExpanded ? null : group.title)
                      }
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-card/40"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium text-foreground truncate block">
                          {group.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {fmtNumber(group.charge_count)} charges
                        </span>
                        <span className="text-xs tabular-nums font-medium text-foreground w-20 text-right">
                          {fmtCurrency(group.total_revenue)}
                        </span>
                      </div>
                    </button>

                    {/* Expanded: assignment controls */}
                    {isExpanded && (
                      <div className="border-t border-border/30 px-3 py-3 bg-card/10">
                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              Assign to product
                            </label>
                            <select
                              value={selectedProduct[group.title] || ""}
                              onChange={(e) =>
                                setSelectedProduct((prev) => ({
                                  ...prev,
                                  [group.title]: e.target.value,
                                }))
                              }
                              className="w-full rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                            >
                              <option value="">Select a product...</option>
                              {Array.from(productsByGroup.entries()).map(
                                ([groupName, products]) => (
                                  <optgroup key={groupName} label={groupName}>
                                    {products.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                )
                              )}
                            </select>
                          </div>
                          <button
                            onClick={() => handleAssign(group.title)}
                            disabled={
                              !selectedProduct[group.title] || isAssigning
                            }
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                              selectedProduct[group.title]
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "bg-muted text-muted-foreground cursor-not-allowed"
                            )}
                          >
                            {isAssigning ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            Assign
                          </button>
                        </div>
                        <p className="mt-2 text-[10px] text-muted-foreground/60">
                          This will match all {fmtNumber(group.charge_count)}{" "}
                          charges containing &ldquo;{group.title}&rdquo; and
                          create a title mapping for future charges.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3">
          <p className="text-[10px] text-muted-foreground/50">
            Assigning a product updates existing charges and creates a mapping
            rule so future charges with the same title are automatically matched.
          </p>
        </div>
      </div>
    </div>
  );
}
