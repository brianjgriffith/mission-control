import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/products/journey?group=Accelerator
// For everyone who bought a product (group), shows their funnel journey:
// - How many funnels they went through before buying
// - Which funnels were most common in the path
// - Speed from first funnel touch to purchase
// - Individual contact paths
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const group = searchParams.get("group");
    const activeOnly = searchParams.get("active") === "true";

    if (!group) {
      return NextResponse.json({ error: "group parameter required" }, { status: 400 });
    }

    // Get product IDs in this group
    const { data: products } = await supabase
      .from("products")
      .select("id")
      .eq("group_name", group);

    const productIds = (products || []).map((p) => p.id);
    if (productIds.length === 0) {
      return NextResponse.json({ error: "No products in this group" }, { status: 404 });
    }

    // Find all contacts who purchased this product group
    // Get unique contact_ids from charges
    let chargesQuery = supabase
      .from("charges")
      .select("contact_id, amount, charge_date")
      .in("product_id", productIds)
      .gt("amount", 0)
      .not("contact_id", "is", null)
      .order("charge_date", { ascending: true });

    // Paginate charges (1000 row limit)
    const allCharges: any[] = [];
    let offset = 0;
    while (true) {
      const { data: batch } = await supabase
        .from("charges")
        .select("contact_id, amount, charge_date")
        .in("product_id", productIds)
        .gt("amount", 0)
        .not("contact_id", "is", null)
        .order("charge_date", { ascending: true })
        .range(offset, offset + 999);
      if (!batch?.length) break;
      allCharges.push(...batch);
      offset += batch.length;
      if (batch.length < 1000) break;
    }

    // Get first purchase per contact for this product group
    const contactFirstPurchase = new Map<string, { date: Date; amount: number }>();
    for (const c of allCharges) {
      if (!contactFirstPurchase.has(c.contact_id)) {
        contactFirstPurchase.set(c.contact_id, {
          date: new Date(c.charge_date),
          amount: Number(c.amount),
        });
      }
    }

    const purchaserContactIds = [...contactFirstPurchase.keys()];

    // If active only, filter to active students
    let filteredContactIds = purchaserContactIds;
    if (activeOnly) {
      const { data: activeStudents } = await supabase
        .from("students")
        .select("contact_id")
        .eq("status", "active")
        .eq("program", group.toLowerCase())
        .not("contact_id", "is", null);

      const activeSet = new Set((activeStudents || []).map((s) => s.contact_id));
      filteredContactIds = purchaserContactIds.filter((id) => activeSet.has(id));
    }

    // Get funnel paths for these contacts
    const pathsByContact = new Map<string, any>();
    for (let i = 0; i < filteredContactIds.length; i += 50) {
      const batch = filteredContactIds.slice(i, i + 50);
      const { data: paths } = await supabase
        .from("contact_funnel_paths")
        .select("contact_id, email, funnels_touched, total_funnels, first_funnel_date, days_to_purchase")
        .in("contact_id", batch);

      for (const p of paths || []) {
        pathsByContact.set(p.contact_id, p);
      }
    }

    // Also get contact names
    const contactNames = new Map<string, { name: string; email: string }>();
    for (let i = 0; i < filteredContactIds.length; i += 50) {
      const batch = filteredContactIds.slice(i, i + 50);
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, full_name, email")
        .in("id", batch);

      for (const c of contacts || []) {
        contactNames.set(c.id, { name: c.full_name || c.email, email: c.email });
      }
    }

    // Analyze paths
    let withPaths = 0;
    let withoutPaths = 0;
    let totalFunnels = 0;
    const daysArr: number[] = [];
    const funnelCounts: Record<string, number> = {};
    const touchDist: Record<string, number> = {
      "0 funnels": 0, "1 funnel": 0, "2 funnels": 0,
      "3-4 funnels": 0, "5-7 funnels": 0, "8+ funnels": 0,
    };

    interface ContactJourney {
      contact_id: string;
      name: string;
      email: string;
      funnels_count: number;
      days_to_purchase: number | null;
      first_purchase_amount: number;
      first_purchase_date: string;
      funnels: Array<{ name: string; date: string }>;
    }

    const contactJourneys: ContactJourney[] = [];

    for (const contactId of filteredContactIds) {
      const path = pathsByContact.get(contactId);
      const purchase = contactFirstPurchase.get(contactId);
      const contactInfo = contactNames.get(contactId);

      if (!purchase || !contactInfo) continue;

      if (path && path.total_funnels > 0) {
        withPaths++;
        totalFunnels += path.total_funnels;

        if (path.days_to_purchase != null) daysArr.push(path.days_to_purchase);

        // Count funnel occurrences
        for (const f of path.funnels_touched || []) {
          funnelCounts[f.funnel_name] = (funnelCounts[f.funnel_name] || 0) + 1;
        }

        // Touch distribution
        const n = path.total_funnels;
        if (n === 1) touchDist["1 funnel"]++;
        else if (n === 2) touchDist["2 funnels"]++;
        else if (n <= 4) touchDist["3-4 funnels"]++;
        else if (n <= 7) touchDist["5-7 funnels"]++;
        else touchDist["8+ funnels"]++;

        contactJourneys.push({
          contact_id: contactId,
          name: contactInfo.name,
          email: contactInfo.email,
          funnels_count: path.total_funnels,
          days_to_purchase: path.days_to_purchase,
          first_purchase_amount: purchase.amount,
          first_purchase_date: purchase.date.toISOString(),
          funnels: (path.funnels_touched || []).map((f: any) => ({
            name: f.funnel_name,
            date: f.added_at,
          })),
        });
      } else {
        withoutPaths++;
        touchDist["0 funnels"]++;

        contactJourneys.push({
          contact_id: contactId,
          name: contactInfo.name,
          email: contactInfo.email,
          funnels_count: 0,
          days_to_purchase: null,
          first_purchase_amount: purchase.amount,
          first_purchase_date: purchase.date.toISOString(),
          funnels: [],
        });
      }
    }

    // Sort journeys: most funnels first
    contactJourneys.sort((a, b) => b.funnels_count - a.funnels_count);

    // Top funnels in the path
    const topFunnels = Object.entries(funnelCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({
        name,
        count,
        pct: withPaths > 0 ? Math.round((count / withPaths) * 100) : 0,
      }));

    const avgFunnels = withPaths > 0 ? Math.round((totalFunnels / withPaths) * 10) / 10 : 0;
    const avgDays = daysArr.length > 0 ? Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length) : null;
    const medianDays = daysArr.length > 0 ? daysArr.sort((a, b) => a - b)[Math.floor(daysArr.length / 2)] : null;

    // Speed distribution
    const speedDist: Record<string, number> = {
      "0-7 days": 0, "8-14 days": 0, "15-30 days": 0,
      "31-60 days": 0, "61-90 days": 0, "90+ days": 0,
    };
    for (const d of daysArr) {
      if (d <= 7) speedDist["0-7 days"]++;
      else if (d <= 14) speedDist["8-14 days"]++;
      else if (d <= 30) speedDist["15-30 days"]++;
      else if (d <= 60) speedDist["31-60 days"]++;
      else if (d <= 90) speedDist["61-90 days"]++;
      else speedDist["90+ days"]++;
    }

    return NextResponse.json({
      product_group: group,
      total_purchasers: filteredContactIds.length,
      with_funnel_paths: withPaths,
      without_funnel_paths: withoutPaths,
      avg_funnels: avgFunnels,
      avg_days: avgDays,
      median_days: medianDays,
      touch_distribution: touchDist,
      speed_distribution: speedDist,
      top_funnels: topFunnels,
      contacts: contactJourneys.slice(0, 200),
      total_contacts: contactJourneys.length,
    });
  } catch (error) {
    console.error("[GET /api/products/journey]", error);
    return NextResponse.json({ error: "Failed to compute product journey" }, { status: 500 });
  }
}
