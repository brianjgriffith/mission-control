import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth";
import { getSalesRepScope } from "@/lib/sales-rep-scope";

// ---------------------------------------------------------------------------
// GET /api/charges
// Returns charges with joined contact + product info.
// Filters: ?month, ?product_id, ?source_platform, ?search, ?page, ?per_page
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    // Sales rep scoping: force filter to own rep ID
    const user = await getAuthUser();
    let scopedRepId: string | null = null;
    if (user) {
      scopedRepId = await getSalesRepScope(user);
    }

    const month = searchParams.get("month"); // YYYY-MM
    const productId = searchParams.get("product_id");
    const groupName = searchParams.get("group"); // product family filter
    const sourcePlatform = searchParams.get("source_platform");
    const repId = scopedRepId || searchParams.get("rep_id"); // sales rep attribution filter
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const perPage = Math.min(parseInt(searchParams.get("per_page") || "50", 10), 200);
    const sortBy = searchParams.get("sort_by") || "charge_date";
    const sortDir = searchParams.get("sort_dir") === "asc" ? true : false; // ascending?

    // Allowed sort columns (prevent injection)
    const ALLOWED_SORTS = ["charge_date", "amount", "source_platform", "payment_plan_type"];
    const safeSortBy = ALLOWED_SORTS.includes(sortBy) ? sortBy : "charge_date";

    // If filtering by rep, get charge IDs attributed to that rep
    let repChargeIds: string[] | null = null;
    if (repId) {
      const { data: attrData } = await supabase
        .from("charge_attributions")
        .select("charge_id")
        .eq("sales_rep_id", repId);
      repChargeIds = (attrData || []).map((a) => a.charge_id);
    }

    // If filtering by group, first get the product IDs in that group
    let groupProductIds: string[] | null = null;
    if (groupName) {
      if (groupName === "Unmatched") {
        // Special case: charges with no product
        groupProductIds = [];
      } else {
        const { data: groupProducts } = await supabase
          .from("products")
          .select("id")
          .eq("group_name", groupName);
        groupProductIds = (groupProducts || []).map((p) => p.id);
      }
    }

    // Build query — include attribution + sales rep via join
    let query = supabase
      .from("charges")
      .select(
        `
        *,
        contacts (id, hubspot_contact_id, email, first_name, last_name, full_name),
        products (id, name, short_name, product_type, program),
        charge_attributions (id, sales_rep_id, attribution_type, sales_reps (id, name))
      `,
        { count: "exact" }
      )
      .order(safeSortBy, { ascending: sortDir });

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
    if (groupProductIds !== null) {
      if (groupProductIds.length === 0) {
        // Unmatched: no product_id
        query = query.is("product_id", null);
      } else {
        query = query.in("product_id", groupProductIds);
      }
    }
    if (sourcePlatform) {
      query = query.eq("source_platform", sourcePlatform);
    }
    if (repChargeIds !== null) {
      if (repChargeIds.length === 0) {
        // Rep has no attributed charges — return empty
        return NextResponse.json({
          charges: [],
          pagination: { page, per_page: perPage, total: 0, total_pages: 0 },
          summary: { total_revenue: 0, total_charges: 0, by_group: {}, by_product: {}, by_platform: {} },
        });
      }
      query = query.in("id", repChargeIds);
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

    // Summary stats via server-side RPC (avoids Supabase 1000-row default limit)
    const { data: summary, error: statsError } = await supabase.rpc("get_charge_stats", {
      filter_month: month || null,
      filter_product_id: productId || null,
      filter_source_platform: sourcePlatform || null,
    });

    if (statsError) {
      console.error("[GET /api/charges] stats RPC error:", statsError.message);
    }

    return NextResponse.json({
      charges: charges || [],
      pagination: {
        page,
        per_page: perPage,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / perPage),
      },
      summary: summary || {
        total_revenue: 0,
        total_charges: 0,
        by_product: {},
        by_platform: {},
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
