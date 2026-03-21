"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SyncLogEntry {
  id: string;
  workflow_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_processed: number | null;
  records_created: number | null;
  records_updated: number | null;
  records_skipped: number | null;
  error_message: string | null;
  error_details: unknown;
  triggered_by: string | null;
}

interface SyncStats {
  total_syncs: number;
  successful: number;
  failed: number;
  last_sync_time: string | null;
}

interface WorkflowSummary {
  workflow_name: string;
  display_name: string;
  last_entry: SyncLogEntry;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "Just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;

  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "--";
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const diffMs = end - start;

  if (diffMs < 1000) return `${diffMs}ms`;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}m ${remainSeconds}s`;
}

function formatWorkflowName(name: string): string {
  return name
    .split("_")
    .map((word) => {
      // Special casing for known acronyms
      const upper = word.toUpperCase();
      if (["HUBSPOT", "API", "CRM", "MRR", "N8N"].includes(upper)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-400",
  error: "bg-red-500/10 text-red-400",
  partial: "bg-amber-500/10 text-amber-400",
  triggered: "bg-blue-500/10 text-blue-400",
  running: "bg-blue-500/10 text-blue-400",
};

function getStatusStyle(status: string): string {
  return STATUS_STYLES[status] ?? "bg-muted text-muted-foreground";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SyncHealthView() {
  const [entries, setEntries] = useState<SyncLogEntry[]>([]);
  const [stats, setStats] = useState<SyncStats>({
    total_syncs: 0,
    successful: 0,
    failed: 0,
    last_sync_time: null,
  });
  const [loading, setLoading] = useState(true);
  const [workflowFilter, setWorkflowFilter] = useState<string>("all");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [retriggering, setRetriggering] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const url =
        workflowFilter && workflowFilter !== "all"
          ? `/api/admin/sync-log?workflow=${encodeURIComponent(workflowFilter)}`
          : "/api/admin/sync-log";

      const res = await fetch(url);
      const data = await res.json();

      if (data.entries) setEntries(data.entries);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      console.error("Failed to fetch sync log:", err);
    } finally {
      setLoading(false);
    }
  }, [workflowFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build workflow summaries (grouped by workflow_name, most recent entry)
  const workflowSummaries: WorkflowSummary[] = (() => {
    const map = new Map<string, SyncLogEntry>();
    for (const entry of entries) {
      if (!map.has(entry.workflow_name)) {
        map.set(entry.workflow_name, entry);
      }
    }
    return Array.from(map.entries()).map(([name, entry]) => ({
      workflow_name: name,
      display_name: formatWorkflowName(name),
      last_entry: entry,
    }));
  })();

  // Unique workflow names for filter dropdown
  const uniqueWorkflows = Array.from(
    new Set(entries.map((e) => e.workflow_name))
  );

  const handleRetrigger = async (workflowName: string) => {
    setRetriggering(workflowName);
    try {
      const res = await fetch("/api/admin/sync-log/retrigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_name: workflowName }),
      });
      if (res.ok) {
        // Refresh data
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to retrigger:", err);
    } finally {
      setRetriggering(null);
    }
  };

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  if (!loading && entries.length === 0) {
    return (
      <div className="h-full overflow-y-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Sync Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor data sync workflows
          </p>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg border border-border/50 bg-card/40 py-20">
          <Activity className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <p className="text-lg font-medium text-muted-foreground">
            No sync activity yet
          </p>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground/60">
            Sync workflows will log their activity here once configured.
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sync Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor data sync workflows
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
          className="flex items-center gap-2 rounded-md border border-border/50 bg-card/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card/80 hover:text-foreground"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        {/* Total Syncs */}
        <div className="rounded-lg border border-border/50 bg-card/40 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            Total Syncs
          </div>
          <p className="mt-2 text-2xl font-bold">{stats.total_syncs}</p>
        </div>

        {/* Successful */}
        <div className="rounded-lg border border-border/50 bg-card/40 p-4">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Successful
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400">
            {stats.successful}
          </p>
        </div>

        {/* Failed */}
        <div className="rounded-lg border border-border/50 bg-card/40 p-4">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <XCircle className="h-4 w-4" />
            Failed
          </div>
          <p className="mt-2 text-2xl font-bold text-red-400">
            {stats.failed}
          </p>
        </div>

        {/* Last Sync */}
        <div className="rounded-lg border border-border/50 bg-card/40 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Last Sync
          </div>
          <p className="mt-2 text-2xl font-bold">
            {formatRelativeTime(stats.last_sync_time)}
          </p>
        </div>
      </div>

      {/* Workflow Status Table */}
      {workflowSummaries.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">
            Workflow Status
          </h2>
          <div className="overflow-hidden rounded-lg border border-border/50 bg-card/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wider text-muted-foreground/60">
                  <th className="px-4 py-3 font-medium">Workflow</th>
                  <th className="px-4 py-3 font-medium">Last Run</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Records</th>
                  <th className="px-4 py-3 font-medium">Error</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {workflowSummaries.map((ws) => {
                  const e = ws.last_entry;
                  return (
                    <tr
                      key={ws.workflow_name}
                      className="border-b border-border/30 last:border-b-0 transition-colors hover:bg-card/60"
                    >
                      <td className="px-4 py-3 font-medium">
                        {ws.display_name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatRelativeTime(e.started_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            getStatusStyle(e.status)
                          )}
                        >
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span title="Processed">
                          {e.records_processed ?? 0}
                        </span>
                        {" / "}
                        <span title="Created" className="text-emerald-400/70">
                          {e.records_created ?? 0}
                        </span>
                        {" / "}
                        <span title="Updated" className="text-blue-400/70">
                          {e.records_updated ?? 0}
                        </span>
                        {" / "}
                        <span title="Skipped" className="text-muted-foreground/50">
                          {e.records_skipped ?? 0}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-red-400/70">
                        {e.error_message ?? "--"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleRetrigger(ws.workflow_name)}
                          disabled={retriggering === ws.workflow_name}
                          className="flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-card/80 hover:text-foreground disabled:opacity-50"
                        >
                          <RefreshCw
                            className={cn(
                              "h-3 w-3",
                              retriggering === ws.workflow_name && "animate-spin"
                            )}
                          />
                          Re-trigger
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full Sync Log Table */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">
            Sync Log
          </h2>

          {/* Workflow filter */}
          <select
            value={workflowFilter}
            onChange={(e) => setWorkflowFilter(e.target.value)}
            className="rounded-md border border-border/50 bg-card/40 px-3 py-1.5 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Workflows</option>
            {uniqueWorkflows.map((wf) => (
              <option key={wf} value={wf}>
                {formatWorkflowName(wf)}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-lg border border-border/50 bg-card/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wider text-muted-foreground/60">
                <th className="px-4 py-3 font-medium"></th>
                <th className="px-4 py-3 font-medium">Workflow</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Records</th>
                <th className="px-4 py-3 font-medium">Triggered By</th>
                <th className="px-4 py-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isExpanded = expandedRowId === entry.id;
                return (
                  <Fragment key={entry.id}>
                    <tr
                      onClick={() =>
                        setExpandedRowId(isExpanded ? null : entry.id)
                      }
                      className="cursor-pointer border-b border-border/30 last:border-b-0 transition-colors hover:bg-card/60"
                    >
                      <td className="pl-4 py-3">
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 text-muted-foreground/40 transition-transform",
                            isExpanded && "rotate-180"
                          )}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {formatWorkflowName(entry.workflow_name)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            getStatusStyle(entry.status)
                          )}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatRelativeTime(entry.started_at)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDuration(entry.started_at, entry.completed_at)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span title="Processed">
                          {entry.records_processed ?? 0}
                        </span>
                        {" / "}
                        <span title="Created" className="text-emerald-400/70">
                          {entry.records_created ?? 0}
                        </span>
                        {" / "}
                        <span title="Updated" className="text-blue-400/70">
                          {entry.records_updated ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {entry.triggered_by ?? "--"}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-red-400/70">
                        {entry.error_message ?? "--"}
                      </td>
                    </tr>

                    {/* Expanded row: error details */}
                    {isExpanded && (
                      <tr className="border-b border-border/30">
                        <td colSpan={8} className="bg-card/20 px-8 py-4">
                          {entry.error_details ? (
                            <div>
                              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                                <AlertTriangle className="h-3 w-3" />
                                Error Details
                              </p>
                              <pre className="max-h-60 overflow-auto rounded-md bg-background/50 p-3 text-xs text-muted-foreground">
                                {typeof entry.error_details === "string"
                                  ? entry.error_details
                                  : JSON.stringify(entry.error_details, null, 2)}
                              </pre>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground/50">
                              No additional details for this entry.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Fragment helper — React.Fragment without importing React
function Fragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
