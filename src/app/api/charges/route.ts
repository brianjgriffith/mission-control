import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/charges
// Returns charges with joined contact + product info.
// Filters: ?month, ?product_id, ?source_platform, ?search, ?page, ?per_page
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const month = searchParams.get("month"); // YYYY-MM
    const productId = searchParams.get("product_id");
    const sourcePlatform = searchParams.get("source_platform");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const perPage = Math.min(parseInt(searchParams.get("per_page") || "50", 10), 200);

    // Build query
    let query = supabase
      .from("charges")
      .select(
        `
        *,
        contacts (id, hubspot_contact_id, email, first_name, last_name, full_name),
        products (id, name, short_name, product_type, program)
      `,
        { count: "exact" }
      )
      .order("charge_date", { ascending: false });

    // Filters
    if (month) {
      const startDate = `${month}-01T00:00:00Z`;
      const [y, m] = month.split("-").map(Number);
      const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      const endDate = `${nextMonth}-01T00:00:00Z`;
      query = query.gte("charge_date", startDate).lt("charge_date", endDate);
    }
    if (productId) {
      query = query.eq("product_id", productId);
    }
    if (sourcePlatform) {
      query = query.eq("source_platform", sourcePlatform);
    }
    if (search) {
      query = query.or(
        `raw_title.ilike.%${search}%,product_variant.ilike.%${search}%`
      );
    }

    // Pagination
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    query = query.range(from, to);

    const { data: charges, error, count } = await query;

    if (error) throw error;

    // Summary stats query (for the selected filters)
    let statsQuery = supabase
      .from("charges")
      .select("amount, product_id, source_platform, charge_date");

    if (month) {
      const startDate = `${month}-01T00:00:00Z`;
      const [y, m] = month.split("-").map(Number);
      const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      const endDate = `${nextMonth}-01T00:00:00Z`;
      statsQuery = statsQuery.gte("charge_date", startDate).lt("charge_date", endDate);
    }
    if (productId) {
      statsQuery = statsQuery.eq("product_id", productId);
    }
    if (sourcePlatform) {
      statsQuery = statsQuery.eq("source_platform", sourcePlatform);
    }

    const { data: statsData } = await statsQuery;

    // Compute summary
    const totalRevenue = (statsData || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const totalCharges = statsData?.length || 0;

    // Revenue by product
    const byProduct = new Map<string, number>();
    for (const c of statsData || []) {
      const pid = c.product_id || "unmatched";
      byProduct.set(pid, (byProduct.get(pid) || 0) + (Number(c.amount) || 0));
    }

    // Revenue by platform
    const byPlatform = new Map<string, number>();
    for (const c of statsData || []) {
      const p = c.source_platform || "unknown";
      byPlatform.set(p, (byPlatform.get(p) || 0) + (Number(c.amount) || 0));
    }

    return NextResponse.json({
      charges: charges || [],
      pagination: {
        page,
        per_page: perPage,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / perPage),
      },
      summary: {
        total_revenue: totalRevenue,
        total_charges: totalCharges,
        by_product: Object.fromEntries(byProduct),
        by_platform: Object.fromEntries(byPlatform),
      },
    });
  } catch (error) {
    console.error("[GET /api/charges]", error);
    return NextResponse.json(
      { error: "Failed to fetch charges" },
      { status: 500 }
    );
  }
}
