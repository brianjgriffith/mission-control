import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/contacts/[id]
// Returns a contact with all their charges (with product info).
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // Fetch contact
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", id)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // Fetch all charges for this contact
    const { data: charges, error: chargesError } = await supabase
      .from("charges")
      .select(`
        id, amount, charge_date, raw_title, product_variant,
        source_platform, payment_plan_type, subscription_status,
        refund_amount, refund_date, is_new_purchase,
        products (id, name, short_name, group_name, product_type, program)
      `)
      .eq("contact_id", id)
      .order("charge_date", { ascending: false });

    if (chargesError) throw chargesError;

    // Fetch meetings for this contact
    const { data: meetings, error: meetingsError } = await supabase
      .from("meetings")
      .select(`
        id, title, meeting_date, duration_minutes, outcome, outcome_notes,
        sales_reps (id, name)
      `)
      .eq("contact_id", id)
      .order("meeting_date", { ascending: false });

    if (meetingsError) throw meetingsError;

    // Fetch student enrollments for this contact
    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("id, name, program, status, coach, member_type, signup_date, monthly_revenue, payment_plan")
      .eq("contact_id", id)
      .order("signup_date", { ascending: false });

    if (studentsError) throw studentsError;

    // Compute summary stats
    const chargeList = charges || [];
    const totalSpend = chargeList.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const totalRefunds = chargeList.reduce((sum, c) => sum + (Number(c.refund_amount) || 0), 0);
    const firstPurchase = chargeList.length > 0
      ? chargeList[chargeList.length - 1].charge_date
      : null;
    const lastPurchase = chargeList.length > 0
      ? chargeList[0].charge_date
      : null;

    // Products purchased (unique)
    const productSet = new Map<string, { name: string; group: string | null; count: number; total: number }>();
    for (const c of chargeList) {
      const prod = c.products as any;
      const key = prod?.id || "unmatched";
      const existing = productSet.get(key);
      if (existing) {
        existing.count++;
        existing.total += Number(c.amount) || 0;
      } else {
        productSet.set(key, {
          name: prod?.short_name || prod?.name || "Unmatched",
          group: prod?.group_name || null,
          count: 1,
          total: Number(c.amount) || 0,
        });
      }
    }

    // Fetch funnel journey path for this contact
    const { data: funnelPath } = await supabase
      .from("contact_funnel_paths")
      .select("funnels_touched, total_funnels, first_funnel_date, days_to_purchase")
      .eq("contact_id", id)
      .maybeSingle();

    return NextResponse.json({
      contact,
      charges: chargeList,
      meetings: meetings || [],
      students: students || [],
      funnel_journey: funnelPath ? {
        funnels_touched: funnelPath.funnels_touched || [],
        total_funnels: funnelPath.total_funnels,
        first_funnel_date: funnelPath.first_funnel_date,
        days_to_purchase: funnelPath.days_to_purchase,
      } : null,
      summary: {
        total_charges: chargeList.length,
        total_spend: totalSpend,
        total_refunds: totalRefunds,
        net_revenue: totalSpend - totalRefunds,
        first_purchase: firstPurchase,
        last_purchase: lastPurchase,
        products: Array.from(productSet.values()).sort((a, b) => b.total - a.total),
      },
    });
  } catch (error) {
    console.error("[GET /api/contacts/[id]]", error);
    return NextResponse.json(
      { error: "Failed to fetch contact" },
      { status: 500 }
    );
  }
}
