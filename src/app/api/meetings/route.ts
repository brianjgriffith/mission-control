import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/meetings
// Returns meetings with joined contact + sales_rep info.
// Filters: ?rep_id, ?month (YYYY-MM), ?outcome, ?page, ?per_page
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const repId = searchParams.get("rep_id");
    const month = searchParams.get("month"); // YYYY-MM
    const outcome = searchParams.get("outcome");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const perPage = Math.min(parseInt(searchParams.get("per_page") || "50", 10), 200);

    // Build query — only show meetings assigned to a sales rep
    let query = supabase
      .from("meetings")
      .select(
        `
        *,
        contacts (id, email, first_name, last_name, full_name),
        sales_reps (id, name, email)
      `,
        { count: "exact" }
      )
      .not("sales_rep_id", "is", null)
      .order("meeting_date", { ascending: false });

    // Filters
    if (repId) {
      query = query.eq("sales_rep_id", repId);
    }
    if (month) {
      const startDate = `${month}-01T00:00:00Z`;
      const [y, m] = month.split("-").map(Number);
      const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      const endDate = `${nextMonth}-01T00:00:00Z`;
      query = query.gte("meeting_date", startDate).lt("meeting_date", endDate);
    }
    if (outcome) {
      query = query.eq("outcome", outcome);
    }

    // Pagination
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    query = query.range(from, to);

    const { data: meetings, error, count } = await query;

    if (error) throw error;

    // Build outcome summary from a separate count query (avoids pagination limit)
    let summaryQuery = supabase
      .from("meetings")
      .select("outcome", { count: "exact", head: false })
      .not("sales_rep_id", "is", null);

    if (repId) summaryQuery = summaryQuery.eq("sales_rep_id", repId);
    if (month) {
      const startDate = `${month}-01T00:00:00Z`;
      const [y, m] = month.split("-").map(Number);
      const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      const endDate = `${nextMonth}-01T00:00:00Z`;
      summaryQuery = summaryQuery.gte("meeting_date", startDate).lt("meeting_date", endDate);
    }

    // Fetch all outcomes for counting (use a large limit since we only select one column)
    const { data: allOutcomes, error: summaryError } = await summaryQuery.limit(50000);

    const byOutcome: Record<string, number> = {};
    let total = 0;
    if (!summaryError && allOutcomes) {
      total = allOutcomes.length;
      for (const row of allOutcomes) {
        const o = row.outcome || "pending";
        byOutcome[o] = (byOutcome[o] || 0) + 1;
      }
    }

    return NextResponse.json({
      meetings: meetings || [],
      pagination: {
        page,
        per_page: perPage,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / perPage),
      },
      summary: {
        total,
        by_outcome: byOutcome,
      },
    });
  } catch (error) {
    console.error("[GET /api/meetings]", error);
    return NextResponse.json(
      { error: "Failed to fetch meetings" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/meetings — Not needed yet (meetings come from HubSpot sync)
// ---------------------------------------------------------------------------

export async function POST() {
  return NextResponse.json(
    { error: "Meetings are synced from HubSpot. Direct creation is not supported." },
    { status: 410 }
  );
}
