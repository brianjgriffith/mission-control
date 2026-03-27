"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  X,
  Search,
  Check,
  Loader2,
  GitBranch,
  Users,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HubSpotList {
  hubspot_list_id: string;
  name: string;
  size: number;
  list_type: string;
  suggested_type: "funnel" | "skip" | "other";
  suggested_funnel_type: string;
  already_imported: boolean;
}

type FunnelType = "lead_magnet" | "quiz" | "web_class" | "funnel" | "event";

const FUNNEL_TYPE_OPTIONS: { value: FunnelType; label: string }[] = [
  { value: "lead_magnet", label: "Lead Magnet" },
  { value: "quiz", label: "Quiz" },
  { value: "web_class", label: "Web Class" },
  { value: "funnel", label: "Funnel (general)" },
  { value: "event", label: "Event" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtNumber = (n: number) =>
  new Intl.NumberFormat("en-US").format(n);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FunnelImportProps {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

export function FunnelImport({ open, onClose, onImported }: FunnelImportProps) {
  const [lists, setLists] = useState<HubSpotList[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [funnelTypes, setFunnelTypes] = useState<Record<string, FunnelType>>({});
  const [importing, setImporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchLists = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/hubspot-lists");
      if (!res.ok) return;
      const json = await res.json();
      const items: HubSpotList[] = json.lists || json;

      setLists(items);

      // Pre-check "funnel" items and set their suggested funnel types
      const preSelected = new Set<string>();
      const preTypes: Record<string, FunnelType> = {};
      for (const item of items) {
        if (item.suggested_type === "funnel" && !item.already_imported) {
          preSelected.add(item.hubspot_list_id);
        }
        // Map suggested_funnel_type to our enum, default to "funnel"
        const mapped = FUNNEL_TYPE_OPTIONS.find(
          (o) => o.value === item.suggested_funnel_type
        );
        preTypes[item.hubspot_list_id] = mapped
          ? mapped.value
          : "funnel";
      }
      setSelected(preSelected);
      setFunnelTypes(preTypes);
    } catch (err) {
      console.error("[FunnelImport] fetch:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchLists();
      setSuccessMessage(null);
    }
  }, [open, fetchLists]);

  // Clear success message after 4s
  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  // Filtered + visible lists
  const visibleLists = useMemo(() => {
    let result = lists;

    // Unless showAll, only show "funnel" suggested type + already imported
    if (!showAll) {
      result = result.filter(
        (l) => l.suggested_type === "funnel" || l.already_imported
      );
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((l) => l.name.toLowerCase().includes(q));
    }

    // Sort: already imported last, then by size desc
    result.sort((a, b) => {
      if (a.already_imported !== b.already_imported) {
        return a.already_imported ? 1 : -1;
      }
      return b.size - a.size;
    });

    return result;
  }, [lists, showAll, search]);

  const suggestedCount = useMemo(
    () => lists.filter((l) => l.suggested_type === "funnel" && !l.already_imported).length,
    [lists]
  );

  const selectableIds = useMemo(
    () => new Set(visibleLists.filter((l) => !l.already_imported).map((l) => l.hubspot_list_id)),
    [visibleLists]
  );

  const selectedCount = useMemo(
    () => [...selected].filter((id) => selectableIds.has(id)).length,
    [selected, selectableIds]
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of selectableIds) next.add(id);
      return next;
    });
  };

  const deselectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of selectableIds) next.delete(id);
      return next;
    });
  };

  const handleImport = async () => {
    const toImport = lists.filter(
      (l) => selected.has(l.hubspot_list_id) && !l.already_imported
    );
    if (toImport.length === 0) return;

    setImporting(true);
    try {
      const res = await fetch("/api/admin/hubspot-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lists: toImport.map((l) => ({
            hubspot_list_id: l.hubspot_list_id,
            name: l.name,
            funnel_type: funnelTypes[l.hubspot_list_id] || "funnel",
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setSuccessMessage(`Error: ${err.error || "Import failed"}`);
        return;
      }

      const result = await res.json();
      const count = result.imported || toImport.length;
      setSuccessMessage(`Successfully imported ${count} funnel${count !== 1 ? "s" : ""}`);
      setSelected(new Set());
      await fetchLists();
      onImported?.();
    } catch (err) {
      console.error("[FunnelImport] import:", err);
      setSuccessMessage("Error: Import failed");
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[5vh]">
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
              <GitBranch className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Import Funnels from HubSpot</h2>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? "Loading lists..."
                  : `${suggestedCount} suggested funnel${suggestedCount !== 1 ? "s" : ""} found`}
              </p>
            </div>
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
          <div
            className={cn(
              "mx-5 mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs",
              successMessage.startsWith("Error")
                ? "bg-red-500/10 text-red-400"
                : "bg-emerald-500/10 text-emerald-400"
            )}
          >
            <Check className="h-3.5 w-3.5 shrink-0" />
            {successMessage}
          </div>
        )}

        {/* Controls */}
        <div className="border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search lists..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-border bg-card/40 py-1.5 pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Show all toggle */}
            <button
              onClick={() => setShowAll(!showAll)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                showAll
                  ? "border-purple-500/30 bg-purple-500/10 text-purple-300"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              {showAll ? (
                <Eye className="h-3 w-3" />
              ) : (
                <EyeOff className="h-3 w-3" />
              )}
              {showAll ? "Showing All" : "Suggested Only"}
            </button>
          </div>

          {/* Select all / deselect all */}
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={selectAll}
              className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <CheckSquare className="h-3 w-3" />
              Select all
            </button>
            <button
              onClick={deselectAll}
              className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <Square className="h-3 w-3" />
              Deselect all
            </button>
            {selectedCount > 0 && (
              <span className="text-[10px] text-muted-foreground/60">
                {selectedCount} selected
              </span>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : visibleLists.length === 0 ? (
            <div className="py-12 text-center">
              <GitBranch className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">
                {search ? "No lists match your search" : "No lists found"}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {visibleLists.map((list) => {
                const isImported = list.already_imported;
                const isChecked = selected.has(list.hubspot_list_id);

                return (
                  <div
                    key={list.hubspot_list_id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                      isImported
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : isChecked
                        ? "border-purple-500/30 bg-purple-500/5"
                        : "border-border/40 bg-card/20 hover:bg-card/40"
                    )}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => !isImported && toggleSelect(list.hubspot_list_id)}
                      disabled={isImported}
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        isImported
                          ? "cursor-not-allowed border-emerald-500/30 bg-emerald-500/20"
                          : isChecked
                          ? "border-purple-500 bg-purple-500 text-white"
                          : "border-border hover:border-muted-foreground"
                      )}
                    >
                      {(isChecked || isImported) && (
                        <Check className="h-3 w-3" />
                      )}
                    </button>

                    {/* Name + member count */}
                    <div className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-xs font-medium",
                          isImported ? "text-muted-foreground" : "text-foreground"
                        )}
                      >
                        {list.name}
                      </span>
                    </div>

                    {/* Member count */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Users className="h-3 w-3 text-muted-foreground/50" />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {fmtNumber(list.size)}
                      </span>
                    </div>

                    {/* Imported badge or funnel type dropdown */}
                    {isImported ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        <Check className="h-2.5 w-2.5" />
                        Imported
                      </span>
                    ) : (
                      <select
                        value={funnelTypes[list.hubspot_list_id] || "funnel"}
                        onChange={(e) =>
                          setFunnelTypes((prev) => ({
                            ...prev,
                            [list.hubspot_list_id]: e.target.value as FunnelType,
                          }))
                        }
                        className="w-32 shrink-0 rounded-md border border-border bg-card/40 px-2 py-1 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-ring"
                      >
                        {FUNNEL_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer / Import button */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-[10px] text-muted-foreground/50">
            Selected lists will be imported as funnels for journey tracking.
          </p>
          <button
            onClick={handleImport}
            disabled={selectedCount === 0 || importing}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-medium transition-colors",
              selectedCount > 0
                ? "bg-purple-600 text-white hover:bg-purple-700"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {importing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitBranch className="h-3.5 w-3.5" />
            )}
            Import {selectedCount} Selected
          </button>
        </div>
      </div>
    </div>
  );
}
