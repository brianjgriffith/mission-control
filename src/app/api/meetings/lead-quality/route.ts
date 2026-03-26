import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/meetings/lead-quality?month=YYYY-MM
// Returns lead quality metrics: overall, per-rep, and per-source breakdowns.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const month = searchParams.get("month") || defaultMonth;

    const dateStart = `${month}-01T00:00:00Z`;
    const [y, m] = month.split("-").map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const dateEnd = `${nextMonth}-01T00:00:00Z`;

    // Fetch all meetings for the period with a sales rep assigned
    const { data: meetings, error: meetingsError } = await supabase
      .from("meetings")
      .select("id, sales_rep_id, contact_id, outcome, booking_source")
      .not("sales_rep_id", "is", null)
      .gte("meeting_date", dateStart)
      .lt("meeting_date", dateEnd)
      .limit(50000);

    if (meetingsError) throw meetingsError;

    const meetingList = meetings || [];

    // Load sales reps (only sales type)
    const { data: reps } = await supabase
      .from("sales_reps")
      .select("id, name, rep_type")
      .eq("rep_type", "sales")
      .eq("is_active", true);

    const salesRepIds = new Set((reps || []).map((r) => r.id));
    const repNameMap = new Map<string, string>();
    for (const rep of reps || []) {
      repNameMap.set(rep.id, rep.name);
    }

    // Filter meetings to only those assigned to sales reps
    const salesMeetings = meetingList.filter((m) => salesRepIds.has(m.sales_rep_id));

    // -----------------------------------------------------------------------
    // Overall metrics
    // -----------------------------------------------------------------------
    const total = salesMeetings.length;
    const outcomeCounts: Record<string, number> = {};
    for (const mtg of salesMeetings) {
      const o = mtg.outcome || "pending";
      outcomeCounts[o] = (outcomeCounts[o] || 0) + 1;
    }

    const noShows = outcomeCounts["no_show"] || 0;
    const rescheduled = outcomeCounts["rescheduled"] || 0;
    const notQualified = outcomeCounts["not_qualified"] || 0;
    const leads = outcomeCounts["lead"] || 0;
    const sold = outcomeCounts["sold"] || 0;
    const completed = outcomeCounts["completed"] || 0;

    const noShowRate = total > 0 ? round((noShows / total) * 100) : 0;
    const qualificationRate =
      total > 0 ? round(((total - noShows - rescheduled - notQualified) / total) * 100) : 0;
    const closeRateDenom = sold + leads + notQualified;
    const closeRate = closeRateDenom > 0 ? round((sold / closeRateDenom) * 100) : 0;

    // -----------------------------------------------------------------------
    // Per-rep metrics
    // -----------------------------------------------------------------------
    interface RepBucket {
      rep_id: string;
      rep_name: string;
      total_meetings: number;
      completed: number;
      no_shows: number;
      rescheduled: number;
      not_qualified: number;
      leads: number;
      sold: number;
      sold_contact_ids: string[];
    }

    const repBuckets = new Map<string, RepBucket>();
    for (const rep of reps || []) {
      repBuckets.set(rep.id, {
        rep_id: rep.id,
        rep_name: rep.name,
        total_meetings: 0,
        completed: 0,
        no_shows: 0,
        rescheduled: 0,
        not_qualified: 0,
        leads: 0,
        sold: 0,
        sold_contact_ids: [],
      });
    }

    for (const mtg of salesMeetings) {
      const bucket = repBuckets.get(mtg.sales_rep_id);
      if (!bucket) continue;

      bucket.total_meetings++;
      const o = mtg.outcome || "pending";
      if (o === "completed") bucket.completed++;
      else if (o === "no_show") bucket.no_shows++;
      else if (o === "rescheduled") bucket.rescheduled++;
      else if (o === "not_qualified") bucket.not_qualified++;
      else if (o === "lead") bucket.leads++;
      else if (o === "sold") {
        bucket.sold++;
        if (mtg.contact_id) bucket.sold_contact_ids.push(mtg.contact_id);
      }
    }

    // -----------------------------------------------------------------------
    // Revenue from sold: join meetings(outcome=sold) → contact_id → charges
    // attributed to the rep in the same month
    // -----------------------------------------------------------------------
    // Collect all (rep_id, contact_id) pairs for sold meetings
    const repContactPairs: { rep_id: string; contact_id: string }[] = [];
    for (const bucket of repBuckets.values()) {
      for (const cid of bucket.sold_contact_ids) {
        repContactPairs.push({ rep_id: bucket.rep_id, contact_id: cid });
      }
    }

    // Fetch charges for those contacts in the same month
    const revenueByRep = new Map<string, number>();

    if (repContactPairs.length > 0) {
      const contactIds = [...new Set(repContactPairs.map((p) => p.contact_id))];
      const repIds = [...new Set(repContactPairs.map((p) => p.rep_id))];

      // Get charges for these contacts in this month
      const { data: charges } = await supabase
        .from("charges")
        .select("id, contact_id, amount, charge_attributions (sales_rep_id)")
        .in("contact_id", contactIds)
        .gte("charge_date", dateStart)
        .lt("charge_date", dateEnd)
        .limit(50000);

      // Build contact→rep mapping from our sold meetings
      const contactToReps = new Map<string, Set<string>>();
      for (const pair of repContactPairs) {
        if (!contactToReps.has(pair.contact_id)) {
          contactToReps.set(pair.contact_id, new Set());
        }
        contactToReps.get(pair.contact_id)!.add(pair.rep_id);
      }

      for (const charge of charges || []) {
        const amount = charge.amount || 0;
        const attributions = charge.charge_attributions as
          | { sales_rep_id: string }[]
          | { sales_rep_id: string }
          | null;

        // Check if charge is attributed to one of our sales reps
        let attributedRepId: string | null = null;

        if (Array.isArray(attributions) && attributions.length > 0) {
          // Charge has explicit attribution — use it if it's one of our reps
          const attr = attributions[0];
          if (repIds.includes(attr.sales_rep_id)) {
            attributedRepId = attr.sales_rep_id;
          }
        } else if (attributions && !Array.isArray(attributions) && attributions.sales_rep_id) {
          if (repIds.includes(attributions.sales_rep_id)) {
            attributedRepId = attributions.sales_rep_id;
          }
        }

        if (!attributedRepId && charge.contact_id) {
          // Fallback: attribute to the rep who sold the meeting with this contact
          const possibleReps = contactToReps.get(charge.contact_id);
          if (possibleReps && possibleReps.size > 0) {
            attributedRepId = [...possibleReps][0];
          }
        }

        if (attributedRepId) {
          revenueByRep.set(attributedRepId, (revenueByRep.get(attributedRepId) || 0) + amount);
        }
      }
    }

    // Build per-rep response
    const byRep = Array.from(repBuckets.values())
      .filter((b) => b.total_meetings > 0)
      .map((b) => {
        const repCloseRateDenom = b.sold + b.leads + b.not_qualified;
        return {
          rep_id: b.rep_id,
          rep_name: b.rep_name,
          total_meetings: b.total_meetings,
          completed: b.completed,
          no_shows: b.no_shows,
          rescheduled: b.rescheduled,
          not_qualified: b.not_qualified,
          leads: b.leads,
          sold: b.sold,
          no_show_rate: b.total_meetings > 0 ? round((b.no_shows / b.total_meetings) * 100) : 0,
          qualification_rate:
            b.total_meetings > 0
              ? round(
                  ((b.total_meetings - b.no_shows - b.rescheduled - b.not_qualified) /
                    b.total_meetings) *
                    100
                )
              : 0,
          close_rate: repCloseRateDenom > 0 ? round((b.sold / repCloseRateDenom) * 100) : 0,
          revenue_from_sold: revenueByRep.get(b.rep_id) || 0,
        };
      })
      .sort((a, b) => b.close_rate - a.close_rate);

    // -----------------------------------------------------------------------
    // By source
    // -----------------------------------------------------------------------
    const sourceBuckets = new Map<string, { total: number; sold: number }>();
    for (const mtg of salesMeetings) {
      const src = mtg.booking_source || "Unknown";
      if (!sourceBuckets.has(src)) {
        sourceBuckets.set(src, { total: 0, sold: 0 });
      }
      const sb = sourceBuckets.get(src)!;
      sb.total++;
      if (mtg.outcome === "sold") sb.sold++;
    }

    const bySource = Array.from(sourceBuckets.entries())
      .map(([source, sb]) => ({
        source,
        total_meetings: sb.total,
        sold: sb.sold,
        close_rate: sb.total > 0 ? round((sb.sold / sb.total) * 100) : 0,
      }))
      .sort((a, b) => b.total_meetings - a.total_meetings);

    return NextResponse.json({
      period: month,
      overall: {
        total_meetings: total,
        completed,
        no_shows: noShows,
        rescheduled,
        not_qualified: notQualified,
        leads,
        sold,
        no_show_rate: noShowRate,
        qualification_rate: qualificationRate,
        close_rate: closeRate,
      },
      by_rep: byRep,
      by_source: bySource,
    });
  } catch (error) {
    console.error("[GET /api/meetings/lead-quality]", error);
    return NextResponse.json(
      { error: "Failed to fetch lead quality metrics" },
      { status: 500 }
    );
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
