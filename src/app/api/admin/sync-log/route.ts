import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const workflow = req.nextUrl.searchParams.get("workflow");

    let query = supabase
      .from("sync_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100);

    if (workflow) {
      query = query.eq("workflow_name", workflow);
    }

    const { data: entries, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = entries ?? [];

    const successful = rows.filter((e) => e.status === "success").length;
    const failed = rows.filter((e) => e.status === "error").length;
    const last_sync_time = rows.length > 0 ? rows[0].started_at : null;

    return NextResponse.json({
      entries: rows,
      stats: {
        total_syncs: rows.length,
        successful,
        failed,
        last_sync_time,
      },
    });
  } catch (err) {
    console.error("sync-log GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
