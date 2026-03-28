import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/funnels/[id]/detail
// Returns cached funnel detail data (product breakdowns, speed, etc.)
// Pre-computed by scripts/compute-funnel-performance.ts
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // Get cached performance data with funnel info
    const { data: fp, error } = await supabase
      .from("funnel_performance")
      .select("*, funnels(id, name, funnel_type, hubspot_list_id)")
      .eq("funnel_id", id)
      .single();

    if (error || !fp) {
      return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
    }

    const funnel = (fp as any).funnels;

    return NextResponse.json({
      funnel: funnel || { id, name: "", funnel_type: "" },
      summary: {
        total_optins: fp.total_optins,
        purchased_after: fp.purchased_after,
        purchased_before: fp.purchased_before,
        never_purchased: fp.never_purchased,
        conversion_rate: Number(fp.conversion_rate),
        total_revenue_after: Number(fp.revenue_after),
        first_time_buyers: fp.first_time_buyers,
        repeat_buyers: fp.repeat_buyers,
        avg_funnels_before_purchase: fp.avg_funnels_before_purchase ? Number(fp.avg_funnels_before_purchase) : null,
        touch_distribution: fp.touch_distribution || null,
        common_paths: fp.common_paths || [],
      },
      products_after: fp.products_after || [],
      products_before: fp.products_before || [],
      speed: {
        avg_days: fp.avg_days_to_purchase,
        median_days: fp.median_days_to_purchase,
        distribution: fp.speed_distribution || {},
      },
      computed_at: fp.computed_at,
    });
  } catch (error) {
    console.error("[GET /api/funnels/[id]/detail]", error);
    return NextResponse.json(
      { error: "Failed to load funnel detail" },
      { status: 500 }
    );
  }
}
