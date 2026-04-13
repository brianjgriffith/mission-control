import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const dailyOnly = searchParams.get("daily_only") === "true";

    let query = supabase
      .from("funnels")
      .select("*")
      .order("funnel_type")
      .order("name");

    if (dailyOnly) {
      query = query.eq("daily_tracking", true);
    }

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json({ funnels: data || [] });
  } catch (error) {
    console.error("[GET /api/funnels]", error);
    return NextResponse.json({ error: "Failed to fetch funnels" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/funnels
// Toggle daily_tracking for a funnel.
// Body: { funnel_id: string, daily_tracking: boolean }
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    if (!body.funnel_id || typeof body.daily_tracking !== "boolean") {
      return NextResponse.json(
        { error: "funnel_id and daily_tracking (boolean) are required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("funnels")
      .update({ daily_tracking: body.daily_tracking })
      .eq("id", body.funnel_id);

    if (error) throw error;

    return NextResponse.json({ success: true, daily_tracking: body.daily_tracking });
  } catch (error) {
    console.error("[PATCH /api/funnels]", error);
    return NextResponse.json({ error: "Failed to update funnel" }, { status: 500 });
  }
}
