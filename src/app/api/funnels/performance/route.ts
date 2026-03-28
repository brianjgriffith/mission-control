import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/funnels/performance
// Returns cached funnel performance data from funnel_performance table.
// Pre-computed by scripts/compute-funnel-performance.ts
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const funnelId = searchParams.get("funnel_id");

    let query = supabase
      .from("funnel_performance")
      .select(`
        *,
        funnels (id, name, funnel_type, hubspot_list_id)
      `)
      .order("conversion_rate", { ascending: false });

    if (funnelId) {
      query = query.eq("funnel_id", funnelId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const funnels = (data || []).map((fp: any) => ({
      funnel_id: fp.funnel_id,
      funnel_name: fp.funnels?.name || "",
      funnel_type: fp.funnels?.funnel_type || "general",
      hubspot_list_id: fp.funnels?.hubspot_list_id || "",
      total_optins: fp.total_optins,
      purchased_after: fp.purchased_after,
      purchased_before: fp.purchased_before,
      never_purchased: fp.never_purchased,
      conversion_rate: Number(fp.conversion_rate),
      revenue_after: Number(fp.revenue_after),
      avg_days_to_purchase: fp.avg_days_to_purchase,
      first_time_buyers: fp.first_time_buyers,
      repeat_buyers: fp.repeat_buyers,
      computed_at: fp.computed_at,
    }));

    return NextResponse.json({ funnels });
  } catch (error) {
    console.error("[GET /api/funnels/performance]", error);
    return NextResponse.json(
      { error: "Failed to fetch funnel performance" },
      { status: 500 }
    );
  }
}
