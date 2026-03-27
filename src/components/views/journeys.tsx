"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  GitBranch,
  Import,
  Users,
  Loader2,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { FunnelImport } from "@/components/funnel-import";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Funnel {
  id: string;
  hubspot_list_id: string;
  name: string;
  funnel_type: string;
  member_count: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtNumber = (n: number) =>
  new Intl.NumberFormat("en-US").format(n);

const FUNNEL_TYPE_COLORS: Record<string, string> = {
  lead_magnet: "bg-blue-500/15 text-blue-400",
  quiz: "bg-amber-500/15 text-amber-400",
  web_class: "bg-emerald-500/15 text-emerald-400",
  funnel: "bg-purple-500/15 text-purple-400",
  event: "bg-pink-500/15 text-pink-400",
};

const FUNNEL_TYPE_LABELS: Record<string, string> = {
  lead_magnet: "Lead Magnet",
  quiz: "Quiz",
  web_class: "Web Class",
  funnel: "Funnel",
  event: "Event",
};

// ---------------------------------------------------------------------------
// Journeys View
// ---------------------------------------------------------------------------

export function JourneysView() {
  const [importOpen, setImportOpen] = useState(false);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFunnels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/funnels");
      if (!res.ok) {
        setFunnels([]);
        return;
      }
      const json = await res.json();
      setFunnels(json.funnels || json || []);
    } catch (err) {
      console.error("[JourneysView] fetch:", err);
      setFunnels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFunnels();
  }, [fetchFunnels]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
            <GitBranch className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Funnel & Journey Tracking</h1>
            <p className="text-xs text-muted-foreground">
              Track contacts through your funnels and measure conversion
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
        {/* Imported Funnels */}
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground/80">
            Imported Funnels
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : funnels.length === 0 ? (
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {funnels.map((funnel) => (
                <div
                  key={funnel.id}
                  className="rounded-lg border border-border/40 bg-card/20 p-4 transition-colors hover:bg-card/40"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <h3 className="text-sm font-medium text-foreground leading-tight">
                      {funnel.name}
                    </h3>
                    <span
                      className={cn(
                        "ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        FUNNEL_TYPE_COLORS[funnel.funnel_type] ||
                          "bg-zinc-500/15 text-zinc-400"
                      )}
                    >
                      {FUNNEL_TYPE_LABELS[funnel.funnel_type] ||
                        funnel.funnel_type}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {fmtNumber(funnel.member_count || 0)} members
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Journey Metrics Placeholder */}
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground/80">
            Journey Metrics
          </h2>
          <div className="rounded-xl border border-dashed border-border/60 bg-card/10 py-12 text-center">
            <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/20" />
            <p className="mt-3 text-sm text-muted-foreground">
              Journey analytics coming soon
            </p>
            <p className="mt-1 max-w-md mx-auto text-xs text-muted-foreground/60">
              Once funnels are imported, you will be able to see conversion rates,
              time-to-convert, and cross-funnel journey paths.
            </p>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      <FunnelImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={fetchFunnels}
      />
    </div>
  );
}
