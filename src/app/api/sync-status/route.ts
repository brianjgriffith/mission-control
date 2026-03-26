import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/sync-status
// Returns the most recent sync_log entry per workflow, plus overall health.
// ---------------------------------------------------------------------------

interface SyncEntry {
  workflow: string;
  last_run: string;
  status: string;
  records: number;
  error_message: string | null;
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Get all sync_log entries ordered by started_at desc
    const { data: logs, error } = await supabase
      .from("sync_log")
      .select("workflow_name, status, started_at, completed_at, records_processed, error_message")
      .order("started_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by workflow_name, keep only the most recent entry per workflow
    const latestByWorkflow = new Map<string, SyncEntry>();
    for (const log of logs ?? []) {
      if (!latestByWorkflow.has(log.workflow_name)) {
        latestByWorkflow.set(log.workflow_name, {
          workflow: log.workflow_name,
          last_run: log.completed_at || log.started_at,
          status: log.status,
          records: log.records_processed ?? 0,
          error_message: log.error_message ?? null,
        });
      }
    }

    const syncs = Array.from(latestByWorkflow.values());

    // Determine overall status
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    let overallStatus: "healthy" | "stale" | "error" = "healthy";

    for (const sync of syncs) {
      if (sync.status === "error" || sync.status === "failed") {
        overallStatus = "error";
        break;
      }
      if (new Date(sync.last_run) < twoHoursAgo) {
        overallStatus = "stale";
      }
    }

    // Find the most recent sync timestamp across all workflows
    const lastSync = syncs.length > 0
      ? syncs.reduce((latest, s) =>
          new Date(s.last_run) > new Date(latest.last_run) ? s : latest
        ).last_run
      : null;

    return NextResponse.json({
      syncs,
      overall_status: syncs.length === 0 ? "stale" : overallStatus,
      last_sync: lastSync,
    });
  } catch (err) {
    console.error("[sync-status] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch sync status" },
      { status: 500 }
    );
  }
}
