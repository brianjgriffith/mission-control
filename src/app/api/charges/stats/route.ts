import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/charges/stats
// Returns monthly revenue aggregations for charts.
// Optional: ?months=12 (default 12), ?product_id
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const monthCount = parseInt(searchParams.get("months") || "12", 10);
    const productId = searchParams.get("product_id");

    // Calculate date range
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthCount + 1, 1);
    const startStr = startDate.toISOString();

    let query = supabase
      .from("charges")
      .select("amount, charge_date, product_id, source_platform")
      .gte("charge_date", startStr)
      .order("charge_date", { ascending: true });

    if (productId) {
      query = query.eq("product_id", productId);
    }

    const { data: charges, error } = await query;
    if (error) throw error;

    // Also fetch product names for the legend
    const { data: products } = await supabase
      .from("products")
      .select("id, name, short_name, product_type, program");

    const productMap = new Map<string, { name: string; short_name: string; program: string | null }>();
    for (const p of products || []) {
      productMap.set(p.id, { name: p.name, short_name: p.short_name, program: p.program });
    }

    // Aggregate by month
    interface MonthData {
      month: string; // YYYY-MM
      total: number;
      count: number;
      by_product: Record<string, number>;
      by_platform: Record<string, number>;
    }

    const months = new Map<string, MonthData>();

    for (const c of charges || []) {
      const date = new Date(c.charge_date);
      const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const amount = Number(c.amount) || 0;

      if (!months.has(monthKey)) {
        months.set(monthKey, {
          month: monthKey,
          total: 0,
          count: 0,
          by_product: {},
          by_platform: {},
        });
      }

      const m = months.get(monthKey)!;
      m.total += amount;
      m.count++;

      const prodKey = c.product_id || "unmatched";
      m.by_product[prodKey] = (m.by_product[prodKey] || 0) + amount;

      const platKey = c.source_platform || "unknown";
      m.by_platform[platKey] = (m.by_platform[platKey] || 0) + amount;
    }

    // Fill in missing months with zeros
    const monthlyData: MonthData[] = [];
    const cursor = new Date(startDate);
    while (cursor <= now) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      monthlyData.push(
        months.get(key) || { month: key, total: 0, count: 0, by_product: {}, by_platform: {} }
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Top products by total revenue
    const productTotals = new Map<string, number>();
    for (const m of monthlyData) {
      for (const [pid, amt] of Object.entries(m.by_product)) {
        productTotals.set(pid, (productTotals.get(pid) || 0) + amt);
      }
    }
    const topProducts = Array.from(productTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, total]) => ({
        id,
        name: productMap.get(id)?.name || "Unmatched",
        short_name: productMap.get(id)?.short_name || "Unmatched",
        program: productMap.get(id)?.program || null,
        total,
      }));

    return NextResponse.json({
      monthly: monthlyData,
      top_products: topProducts,
      products: Object.fromEntries(
        (products || []).map((p) => [p.id, { name: p.name, short_name: p.short_name, program: p.program }])
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
