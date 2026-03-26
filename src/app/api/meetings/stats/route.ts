import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/meetings/stats
// Returns meeting stats for the dashboard.
// Filter: ?month (YYYY-MM, defaults to current month)
// Returns: total, outcome breakdown, per-rep stats
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    // Support custom date range or month
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const month = searchParams.get("month") || defaultMonth;
    const customStart = searchParams.get("start_date"); // YYYY-MM-DD
    const customEnd = searchParams.get("end_date"); // YYYY-MM-DD

    let dateStart: string;
    let dateEnd: string;

    if (customStart && customEnd) {
      dateStart = `${customStart}T00:00:00Z`;
      dateEnd = `${customEnd}T23:59:59Z`;
    } else {
      dateStart = `${month}-01T00:00:00Z`;
      const [y, m] = month.split("-").map(Number);
      const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      dateEnd = `${nextMonth}-01T00:00:00Z`;
    }

    // Fetch sales-rep meetings for the period (exclude coaching/team meetings)
    let meetingsQuery = supabase
      .from("meetings")
      .select("id, sales_rep_id, outcome")
      .not("sales_rep_id", "is", null)
      .gte("meeting_date", dateStart)
      .limit(50000);

    // Use lt for month ranges, lte for custom ranges
    meetingsQuery = customStart && customEnd
      ? meetingsQuery.lte("meeting_date", dateEnd)
      : meetingsQuery.lt("meeting_date", dateEnd);

    const { data: meetings, error } = await meetingsQuery;

    if (error) throw error;

    const meetingList = meetings || [];

    // Total meetings this month
    const totalMeetings = meetingList.length;

    // Outcome breakdown
    const byOutcome: Record<string, number> = {};
    for (const mtg of meetingList) {
      const o = mtg.outcome || "pending";
      byOutcome[o] = (byOutcome[o] || 0) + 1;
    }

    // Per-rep stats
    // First, load all sales reps for name lookup
    const { data: reps } = await supabase
      .from("sales_reps")
      .select("id, name")
      .eq("is_active", true);

    const repMap = new Map<string, string>();
    for (const rep of reps || []) {
      repMap.set(rep.id, rep.name);
    }

    // Aggregate per rep
    const repStats = new Map<string, { rep_name: string; total_meetings: number; outcomes: Record<string, number> }>();

    // Initialize all reps (even those with zero meetings this month)
    for (const rep of reps || []) {
      repStats.set(rep.id, {
        rep_name: rep.name,
        total_meetings: 0,
        outcomes: {},
      });
    }

    for (const mtg of meetingList) {
      if (!mtg.sales_rep_id) continue;

      let stat = repStats.get(mtg.sales_rep_id);
      if (!stat) {
        // Rep exists in meetings but not in sales_reps table (edge case)
        stat = {
          rep_name: "Unknown",
          total_meetings: 0,
          outcomes: {},
        };
        repStats.set(mtg.sales_rep_id, stat);
      }

      stat.total_meetings++;
      const o = mtg.outcome || "pending";
      stat.outcomes[o] = (stat.outcomes[o] || 0) + 1;
    }

    return NextResponse.json({
      month,
      total_meetings: totalMeetings,
      by_outcome: byOutcome,
      per_rep: Array.from(repStats.values()).sort((a, b) => b.total_meetings - a.total_meetings),
    });
  } catch (error) {
    console.error("[GET /api/meetings/stats]", error);
    return NextResponse.json(
      { error: "Failed to fetch meeting stats" },
      { status: 500 }
    );
  }
}
