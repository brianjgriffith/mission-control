import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/financials/sales
// Returns rep sales data. Optional filters: ?rep=Name, ?product=elite
// Includes unique rep names and product names (unfiltered) for UI dropdowns.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const rep = searchParams.get("rep");
    const product = searchParams.get("product");

    // Build filtered query
    let query = supabase
      .from("rep_sales")
      .select("*")
      .order("month", { ascending: true })
      .order("rep_name", { ascending: true });

    if (rep) {
      query = query.eq("rep_name", rep);
    }
    if (product) {
      query = query.eq("product", product);
    }

    const { data: sales, error: salesError } = await query;
    if (salesError) throw salesError;

    // Distinct rep names (unfiltered)
    const { data: repRows, error: repError } = await supabase
      .from("rep_sales")
      .select("rep_name")
      .order("rep_name", { ascending: true });
    if (repError) throw repError;

    const reps = [...new Set(repRows.map((r) => r.rep_name))];

    // Distinct products (unfiltered)
    const { data: productRows, error: productError } = await supabase
      .from("rep_sales")
      .select("product")
      .order("product", { ascending: true });
    if (productError) throw productError;

    const products = [...new Set(productRows.map((p) => p.product))];

    return NextResponse.json({ sales, reps, products });
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
// Create or update (upsert) a rep sale record.
// Body: { rep_name, month, product, amount, deal_count?, notes? }
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

    // Auto-compute amount from sub-fields when they're provided
    const hasSubFields = body.new_amount !== undefined || body.recurring_amount !== undefined || body.refund_amount !== undefined;
    const computedAmount = (body.new_amount ?? 0) + (body.recurring_amount ?? 0) - (body.refund_amount ?? 0);
    const finalAmount = hasSubFields ? computedAmount : body.amount;

    const supabase = createAdminClient();

    // Check if a record already exists for this rep + month + product
    const { data: existing, error: findError } = await supabase
      .from("rep_sales")
      .select("id")
      .eq("rep_name", body.rep_name)
      .eq("month", body.month)
      .eq("product", body.product)
      .maybeSingle();
    if (findError) throw findError;

    if (existing) {
      // Update existing
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

    // Create new
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
