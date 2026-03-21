import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workflow_name } = body;

    if (!workflow_name) {
      return NextResponse.json(
        { error: "workflow_name is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: entry, error } = await supabase
      .from("sync_log")
      .insert({
        workflow_name,
        status: "triggered",
        triggered_by: "manual",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, entry });
  } catch (err) {
    console.error("sync-log retrigger error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
