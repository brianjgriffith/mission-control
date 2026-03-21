import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/charges/stats
// Returns monthly revenue aggregations for charts.
// Uses server-side RPC to avoid Supabase 1000-row default limit.
// Optional: ?months=12 (default 12), ?product_id
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const monthCount = parseInt(searchParams.get("months") || "12", 10);
    const productId = searchParams.get("product_id");

    // Calculate start date
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthCount + 1, 1);

    // Fetch monthly aggregations via RPC
    const { data: monthlyRaw, error: monthlyError } = await supabase.rpc(
      "get_monthly_charge_stats",
      {
        start_date: startDate.toISOString(),
        filter_product_id: productId || null,
      }
    );

    if (monthlyError) throw monthlyError;

    // Fetch product names for the legend
    const { data: products } = await supabase
      .from("products")
      .select("id, name, short_name, product_type, program, group_name");

    const productMap = new Map<string, { name: string; short_name: string; program: string | null }>();
    for (const p of products || []) {
      productMap.set(p.id, { name: p.name, short_name: p.short_name, program: p.program });
    }

    // The RPC returns an array of { month, total, count, by_product }
    const rpcMonths = (monthlyRaw || []) as Array<{
      month: string;
      total: number;
      count: number;
      by_group: Record<string, number>;
    }>;

    // Build a map for quick lookup
    const rpcMap = new Map<string, typeof rpcMonths[0]>();
    for (const m of rpcMonths) {
      rpcMap.set(m.month, m);
    }

    // Fill in missing months with zeros
    const monthlyData: Array<{
      month: string;
      total: number;
      count: number;
      by_group: Record<string, number>;
    }> = [];

    const cursor = new Date(startDate);
    while (cursor <= now) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      const rpcEntry = rpcMap.get(key);
      monthlyData.push({
        month: key,
        total: rpcEntry?.total || 0,
        count: rpcEntry?.count || 0,
        by_group: rpcEntry?.by_group || {},
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Top groups by total revenue across all months
    const groupTotals = new Map<string, number>();
    for (const m of monthlyData) {
      for (const [group, amt] of Object.entries(m.by_group)) {
        groupTotals.set(group, (groupTotals.get(group) || 0) + amt);
      }
    }
    const topGroups = Array.from(groupTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, total]) => ({
        name,
        total,
      }));

    return NextResponse.json({
      monthly: monthlyData,
      top_groups: topGroups,
      products: Object.fromEntries(
        (products || []).map((p) => [p.id, { name: p.name, short_name: p.short_name, program: p.program, group_name: p.group_name }])
      ),
    });
  } catch (error) {
    console.error("[GET /api/charges/stats]", error);
    return NextResponse.json(
      { error: "Failed to fetch charge stats" },
      { status: 500 }
    );
  }
}
