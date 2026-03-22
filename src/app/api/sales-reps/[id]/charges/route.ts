import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/sales-reps/[id]/charges
// Returns all charges attributed to a sales rep.
// Filters: ?month (YYYY-MM)
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    // Get all charge IDs attributed to this rep
    const { data: attributions, error: attrError } = await supabase
      .from("charge_attributions")
      .select("charge_id")
      .eq("sales_rep_id", id);

    if (attrError) throw attrError;

    const chargeIds = (attributions || []).map((a) => a.charge_id);

    if (chargeIds.length === 0) {
      return NextResponse.json({ charges: [], rep: null, summary: { total: 0, new_revenue: 0, recurring_revenue: 0, deal_count: 0 } });
    }

    // Fetch the charges with contact + product info
    let query = supabase
      .from("charges")
      .select(`
        id, amount, charge_date, raw_title, product_variant, source_platform,
        payment_plan_type, subscription_status,
        contacts (id, full_name, email),
        products (id, name, short_name, group_name)
      `)
      .in("id", chargeIds)
      .order("charge_date", { ascending: false });

    if (month) {
      const startDate = `${month}-01T00:00:00Z`;
      const [y, m] = month.split("-").map(Number);
      const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      const endDate = `${nextMonth}-01T00:00:00Z`;
      query = query.gte("charge_date", startDate).lt("charge_date", endDate);
    }

    const { data: charges, error: chargesError } = await query;
    if (chargesError) throw chargesError;

    // Get rep info
    const { data: rep } = await supabase
      .from("sales_reps")
      .select("id, name, rep_type")
      .eq("id", id)
      .single();

    // Compute new vs recurring for each charge
    // A charge is "new" if it's the first charge for that contact + product group
    const chargeList = charges || [];
    const contactProductFirstDate = new Map<string, string>();

    // Get all charges for these contacts to determine first purchase dates
    const contactIds = [...new Set(chargeList.map((c: any) => c.contacts?.id).filter(Boolean))];

    if (contactIds.length > 0) {
      const { data: allContactCharges } = await supabase
        .from("charges")
        .select("contact_id, product_id, charge_date, products(group_name, short_name)")
        .in("contact_id", contactIds)
        .order("charge_date", { ascending: true });

      for (const c of allContactCharges || []) {
        const group = (c as any).products?.group_name || (c as any).products?.short_name || "Other";
        const key = `${c.contact_id}|${group}`;
        if (!contactProductFirstDate.has(key)) {
          contactProductFirstDate.set(key, c.charge_date);
        }
      }
    }

    // Annotate charges with new/recurring
    const annotated = chargeList.map((c: any) => {
      const group = c.products?.group_name || c.products?.short_name || "Other";
      const contactId = c.contacts?.id;
      const key = contactId ? `${contactId}|${group}` : null;
      const firstDate = key ? contactProductFirstDate.get(key) : null;
      const isNew = !firstDate || c.charge_date <= firstDate;

      return {
        ...c,
        is_new: isNew,
        product_group: group,
      };
    });

    // Summary
    const total = annotated.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);
    const newRevenue = annotated.filter((c: any) => c.is_new).reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);
    const recurringRevenue = annotated.filter((c: any) => !c.is_new).reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);
    const dealCount = annotated.filter((c: any) => c.is_new).length;

    return NextResponse.json({
      charges: annotated,
      rep,
      summary: {
        total,
        new_revenue: newRevenue,
        recurring_revenue: recurringRevenue,
        deal_count: dealCount,
      },
    });
  } catch (error) {
    console.error("[GET /api/sales-reps/[id]/charges]", error);
    return NextResponse.json(
      { error: "Failed to fetch rep charges" },
      { status: 500 }
    );
  }
}
