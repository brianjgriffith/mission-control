import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/financials/sales
// Returns rep sales data merged from two sources:
//   1. Automated: charges + charge_attributions (real-time, priority)
//   2. Manual: rep_sales table (historical, fallback)
// Automated data takes priority for any rep+month+product that exists.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const rep = searchParams.get("rep");
    const product = searchParams.get("product");
    const repType = searchParams.get("rep_type") || "sales"; // 'sales', 'coach', or 'all'

    // 1. Fetch automated sales from charges + attributions via RPC
    const { data: autoSalesRaw, error: autoError } = await supabase.rpc(
      "get_rep_sales_from_charges",
      { filter_rep_type: repType === "all" ? null : repType }
    );
    if (autoError) {
      console.error("[GET /api/financials/sales] RPC error:", autoError.message);
    }

    const autoSales = (autoSalesRaw || []) as Array<{
      id: string;
      rep_name: string;
      month: string;
      product: string;
      amount: number;
      new_amount: number;
      recurring_amount: number;
      deal_count: number;
      booked_calls: number;
      refund_amount: number;
      notes: string;
      created_at: string;
      updated_at: string;
    }>;

    // 2. Enrich auto sales with real meeting counts from the meetings table.
    //    Count meetings per sales_rep per month, excluding no_show and rescheduled.
    //    Also count "sold" outcomes separately for close rate.
    if (autoSales.length > 0) {
      // Get all sales rep IDs and their names
      const { data: repsData } = await supabase
        .from("sales_reps")
        .select("id, name")
        .eq("is_active", true);

      if (repsData && repsData.length > 0) {
        const repNameToId = new Map<string, string>();
        for (const r of repsData) repNameToId.set(r.name, r.id);

        // Fetch all meetings with a sales rep (we only need rep_id, date, outcome)
        const { data: allMeetings } = await supabase
          .from("meetings")
          .select("sales_rep_id, meeting_date, outcome")
          .not("sales_rep_id", "is", null)
          .limit(50000);

        if (allMeetings && allMeetings.length > 0) {
          // Build a map: repId|month → { total (excl no_show/rescheduled), sold }
          const meetingCounts = new Map<string, { total: number; sold: number }>();

          for (const mtg of allMeetings) {
            const outcome = mtg.outcome || "pending";
            // Skip no-shows and rescheduled — they don't count as "real" meetings
            if (outcome === "no_show" || outcome === "rescheduled") continue;

            const mtgMonth = mtg.meeting_date?.slice(0, 7); // YYYY-MM
            if (!mtgMonth) continue;

            const key = `${mtg.sales_rep_id}|${mtgMonth}`;
            const existing = meetingCounts.get(key) || { total: 0, sold: 0 };
            existing.total++;
            if (outcome === "sold") existing.sold++;
            meetingCounts.set(key, existing);
          }

          // Inject into auto sales
          for (const sale of autoSales) {
            const repId = repNameToId.get(sale.rep_name);
            if (!repId) continue;
            const counts = meetingCounts.get(`${repId}|${sale.month}`);
            if (counts) {
              sale.booked_calls = counts.total;
            }
          }
        }
      }
    }

    // 3. Fetch manual rep_sales (historical data)
    const { data: manualSales, error: manualError } = await supabase
      .from("rep_sales")
      .select("*")
      .order("month", { ascending: true })
      .order("rep_name", { ascending: true });
    if (manualError) throw manualError;

    // 4. Merge: auto takes priority over manual ONLY from March 2026 onward.
    // Before that, manual data is authoritative (hand-entered historical data).
    const AUTO_START_MONTH = "2026-03";

    // Only use auto data for months >= March 2026
    const autoFiltered = autoSales.filter((s) => s.month >= AUTO_START_MONTH);

    // Build a set of keys from auto data (March 2026+)
    const autoKeys = new Set(
      autoFiltered.map((s) => `${s.rep_name}|${s.month}|${s.product}`)
    );

    // Include manual entries if: before March 2026, OR no auto entry exists
    const manualOnly = (manualSales || []).filter(
      (s) => s.month < AUTO_START_MONTH || !autoKeys.has(`${s.rep_name}|${s.month}|${s.product}`)
    );

    // Combine and sort
    const allSales = [...autoFiltered, ...manualOnly].sort((a, b) => {
      if (a.month !== b.month) return a.month.localeCompare(b.month);
      return a.rep_name.localeCompare(b.rep_name);
    });

    // 5. Apply filters
    let filtered = allSales;
    if (rep) filtered = filtered.filter((s) => s.rep_name === rep);
    if (product) filtered = filtered.filter((s) => s.product === product);

    // 6. Build distinct lists (from unfiltered combined data)
    const reps = [...new Set(allSales.map((s) => s.rep_name))].sort();
    const products = [...new Set(allSales.map((s) => s.product))].sort();

    return NextResponse.json({ sales: filtered, reps, products });
  } catch (error) {
    console.error("[GET /api/financials/sales]", error);
    return NextResponse.json(
      { error: "Failed to fetch rep sales" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/financials/sales
// Manual entry — still writes to rep_sales for backward compatibility.
// In practice, new sales should come through charges + attribution.
// ---------------------------------------------------------------------------

interface CreateBody {
  rep_name: string;
  month: string;
  product: string;
  amount: number;
  new_amount?: number;
  recurring_amount?: number;
  deal_count?: number;
  booked_calls?: number;
  refund_amount?: number;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBody;

    if (!body.rep_name || typeof body.rep_name !== "string") {
      return NextResponse.json(
        { error: "rep_name is required" },
        { status: 400 }
      );
    }
    if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
      return NextResponse.json(
        { error: "month must be in YYYY-MM format" },
        { status: 400 }
      );
    }
    if (!body.product || typeof body.product !== "string") {
      return NextResponse.json(
        { error: "product is required" },
        { status: 400 }
      );
    }
    if (typeof body.amount !== "number" || isNaN(body.amount)) {
      return NextResponse.json(
        { error: "amount must be a number" },
        { status: 400 }
      );
    }

    const hasSubFields = body.new_amount !== undefined || body.recurring_amount !== undefined || body.refund_amount !== undefined;
    const computedAmount = (body.new_amount ?? 0) + (body.recurring_amount ?? 0) - (body.refund_amount ?? 0);
    const finalAmount = hasSubFields ? computedAmount : body.amount;

    const supabase = createAdminClient();

    const { data: existing, error: findError } = await supabase
      .from("rep_sales")
      .select("id")
      .eq("rep_name", body.rep_name)
      .eq("month", body.month)
      .eq("product", body.product)
      .maybeSingle();
    if (findError) throw findError;

    if (existing) {
      const { data: sale, error: updateError } = await supabase
        .from("rep_sales")
        .update({
          amount: finalAmount,
          new_amount: body.new_amount ?? 0,
          recurring_amount: body.recurring_amount ?? 0,
          deal_count: body.deal_count ?? 0,
          booked_calls: body.booked_calls ?? 0,
          refund_amount: body.refund_amount ?? 0,
          notes: body.notes ?? "",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (updateError) throw updateError;

      return NextResponse.json({ sale });
    }

    const { data: sale, error: insertError } = await supabase
      .from("rep_sales")
      .insert({
        rep_name: body.rep_name,
        month: body.month,
        product: body.product,
        amount: finalAmount,
        new_amount: body.new_amount ?? 0,
        recurring_amount: body.recurring_amount ?? 0,
        deal_count: body.deal_count ?? 0,
        booked_calls: body.booked_calls ?? 0,
        refund_amount: body.refund_amount ?? 0,
        notes: body.notes ?? "",
      })
      .select()
      .single();
    if (insertError) throw insertError;

    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/financials/sales]", error);
    return NextResponse.json(
      { error: "Failed to save rep sale" },
      { status: 500 }
    );
  }
}
