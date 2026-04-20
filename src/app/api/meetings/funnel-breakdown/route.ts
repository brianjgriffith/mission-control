import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/meetings/funnel-breakdown
// Returns rep × funnel counts for one or more months, with active/canceled split.
// Params:
//   ?month=YYYY-MM            → single month
//   ?months=YYYY-MM,YYYY-MM   → multiple months (for trend view)
//   ?include_team_zoom=1      → include internal "Think Team Zoom" meetings
// ---------------------------------------------------------------------------

// Canonical funnel buckets — the order here is the display order.
export const FUNNEL_ORDER = [
  "Think Media Coaching",
  "Think Media Mastermind Application",
  "Talk With Think",
  "Connect with Keith",
  "1-1 Strategy Session",
  "Other",
] as const;

type FunnelBucket = (typeof FUNNEL_ORDER)[number] | "Think Team Zoom";

function classify(rawTitle: string): { canceled: boolean; bucket: FunnelBucket } {
  const t = (rawTitle || "").trim();
  const canceled = /^Canceled:/i.test(t);
  const lower = t.replace(/^Canceled:\s*/i, "").toLowerCase();

  let bucket: FunnelBucket;
  if (lower.includes("think media coaching")) bucket = "Think Media Coaching";
  else if (lower.includes("think media mastermind")) bucket = "Think Media Mastermind Application";
  else if (lower.includes("talk with think")) bucket = "Talk With Think";
  else if (lower.includes("connect with keith")) bucket = "Connect with Keith";
  else if (lower.includes("1-1 strategy") || lower.includes("1:1 strategy") || lower.includes("one-on-one")) bucket = "1-1 Strategy Session";
  else if (lower.includes("think team's zoom") || lower.includes("-think team")) bucket = "Think Team Zoom";
  else bucket = "Other";
  return { canceled, bucket };
}

interface Counts { total: number; active: number; canceled: number }
interface RepBreakdown {
  rep_id: string;
  rep_name: string;
  funnels: Partial<Record<FunnelBucket, Counts>>;
  totals: Counts;
}
interface MonthBreakdown {
  month: string;
  reps: RepBreakdown[];
  totals_by_funnel: Partial<Record<FunnelBucket, Counts>>;
  grand_totals: Counts;
  unassigned_count: number;
  excluded_team_zoom_count: number;
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${month}-01T00:00:00Z`, end: `${next}-01T00:00:00Z` };
}

function emptyCounts(): Counts { return { total: 0, active: 0, canceled: 0 }; }

function addTo(target: Counts, canceled: boolean): void {
  target.total += 1;
  if (canceled) target.canceled += 1;
  else target.active += 1;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const includeTeamZoom = searchParams.get("include_team_zoom") === "1";
    const monthsParam = searchParams.get("months");
    const single = searchParams.get("month");

    const months: string[] = monthsParam
      ? monthsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : single
      ? [single]
      : [(() => {
          const n = new Date();
          return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
        })()];

    const results: MonthBreakdown[] = [];

    for (const month of months) {
      const { start, end } = monthRange(month);

      const { data: meetings, error } = await supabase
        .from("meetings")
        .select("id, title, sales_rep_id, sales_reps (id, name)")
        .gte("meeting_date", start)
        .lt("meeting_date", end)
        .limit(10000);

      if (error) throw error;

      const repMap = new Map<string, RepBreakdown>();
      const totalsByFunnel: Partial<Record<FunnelBucket, Counts>> = {};
      const grand: Counts = emptyCounts();
      let unassigned = 0;
      let excludedZoom = 0;

      for (const m of meetings || []) {
        const rep = (m as unknown as { sales_reps: { id: string; name: string } | null }).sales_reps;
        if (!rep) { unassigned += 1; continue; }
        const { canceled, bucket } = classify(m.title);

        if (bucket === "Think Team Zoom" && !includeTeamZoom) {
          excludedZoom += 1;
          continue;
        }

        let entry = repMap.get(rep.id);
        if (!entry) {
          entry = { rep_id: rep.id, rep_name: rep.name, funnels: {}, totals: emptyCounts() };
          repMap.set(rep.id, entry);
        }

        if (!entry.funnels[bucket]) entry.funnels[bucket] = emptyCounts();
        addTo(entry.funnels[bucket]!, canceled);
        addTo(entry.totals, canceled);

        if (!totalsByFunnel[bucket]) totalsByFunnel[bucket] = emptyCounts();
        addTo(totalsByFunnel[bucket]!, canceled);
        addTo(grand, canceled);
      }

      const reps = Array.from(repMap.values()).sort((a, b) => b.totals.total - a.totals.total);

      results.push({
        month,
        reps,
        totals_by_funnel: totalsByFunnel,
        grand_totals: grand,
        unassigned_count: unassigned,
        excluded_team_zoom_count: excludedZoom,
      });
    }

    return NextResponse.json({
      months: results,
      funnel_order: FUNNEL_ORDER,
    });
  } catch (error) {
    console.error("[GET /api/meetings/funnel-breakdown]", error);
    return NextResponse.json(
      { error: "Failed to fetch funnel breakdown" },
      { status: 500 }
    );
  }
}
