import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// POST /api/admin/recompute-funnels/[id]
// Recomputes funnel performance for a SINGLE funnel.
// Accepts pre-fetched HubSpot list contacts from n8n to avoid timeout.
//
// Body: { contacts: Array<{ email: string; addedAt: number }> }
//   - n8n fetches HubSpot list contacts and passes them here
//   - This endpoint handles the Supabase lookups + analytics only (fast)
//
// Auth: webhook secret
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = request.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: funnelId } = await params;
  const supabase = createAdminClient();

  // Get funnel
  const { data: funnel } = await supabase
    .from("funnels")
    .select("id, name, funnel_type, hubspot_list_id")
    .eq("id", funnelId)
    .single();

  if (!funnel) {
    return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  const body = await request.json();
  const listContacts: Array<{ email: string; addedAt: number }> = body.contacts || [];

  if (listContacts.length === 0) {
    return NextResponse.json({ error: "No contacts provided in body" }, { status: 400 });
  }

  // Load contacts from Supabase (paginated)
  const emailToContactId = new Map<string, string>();
  let contactOffset = 0;
  while (true) {
    const { data: batch } = await supabase
      .from("contacts")
      .select("id, email")
      .neq("email", "")
      .range(contactOffset, contactOffset + 999);
    if (!batch || batch.length === 0) break;
    for (const c of batch) emailToContactId.set(c.email.toLowerCase(), c.id);
    contactOffset += batch.length;
    if (batch.length < 1000) break;
  }

  // Load products
  const { data: products } = await supabase.from("products").select("id, group_name, short_name");
  const productGroupMap = new Map<string, string>();
  for (const p of products || []) productGroupMap.set(p.id, p.group_name || p.short_name || "Other");

  // Load charges (paginated)
  const chargesByContact = new Map<string, Array<{ amount: number; date: Date; productGroup: string }>>();
  let chargeOffset = 0;
  while (true) {
    const { data: batch } = await supabase
      .from("charges")
      .select("contact_id, amount, charge_date, product_id")
      .gt("amount", 0)
      .order("charge_date", { ascending: true })
      .range(chargeOffset, chargeOffset + 999);
    if (!batch || batch.length === 0) break;
    for (const c of batch) {
      if (!c.contact_id) continue;
      if (!chargesByContact.has(c.contact_id)) chargesByContact.set(c.contact_id, []);
      chargesByContact.get(c.contact_id)!.push({
        amount: Number(c.amount) || 0,
        date: new Date(c.charge_date),
        productGroup: c.product_id ? (productGroupMap.get(c.product_id) || "Other") : "Other",
      });
    }
    chargeOffset += batch.length;
    if (batch.length < 1000) break;
  }

  // First purchase dates
  const contactFirstPurchase = new Map<string, Date>();
  for (const [contactId, charges] of chargesByContact) {
    const sorted = charges.sort((a, b) => a.date.getTime() - b.date.getTime());
    if (sorted.length > 0) contactFirstPurchase.set(contactId, sorted[0].date);
  }

  // Analyze
  let purchasedAfter = 0, purchasedBefore = 0, neverPurchased = 0;
  let revenueAfter = 0, totalDays = 0, daysCount = 0;
  let firstTimeBuyers = 0, repeatBuyers = 0;
  const daysArr: number[] = [];
  const pAfter: Record<string, { count: number; revenue: number; buyers: Set<string> }> = {};
  const pBefore: Record<string, { count: number; revenue: number; buyers: Set<string> }> = {};
  const processed = new Set<string>();

  for (const lc of listContacts) {
    const email = lc.email?.toLowerCase();
    if (!email || processed.has(email)) continue;
    processed.add(email);

    const cid = emailToContactId.get(email);
    if (!cid) { neverPurchased++; continue; }
    const charges = chargesByContact.get(cid);
    if (!charges?.length) { neverPurchased++; continue; }

    const opt = lc.addedAt > 0 ? new Date(lc.addedAt) : null;
    if (!opt) { purchasedBefore++; continue; }

    const after = charges.filter((c) => c.date > opt);
    const before = charges.filter((c) => c.date <= opt);

    if (after.length > 0) {
      purchasedAfter++;
      revenueAfter += after.reduce((s, c) => s + c.amount, 0);
      const first = after.sort((a, b) => a.date.getTime() - b.date.getTime())[0];
      const days = Math.round((first.date.getTime() - opt.getTime()) / 86400000);
      totalDays += days;
      daysCount++;
      daysArr.push(days);

      for (const c of after) {
        const n = c.productGroup;
        if (!pAfter[n]) pAfter[n] = { count: 0, revenue: 0, buyers: new Set() };
        pAfter[n].count++; pAfter[n].revenue += c.amount; pAfter[n].buyers.add(cid);
      }
    } else if (before.length > 0) { purchasedBefore++; } else { neverPurchased++; }

    for (const c of before) {
      const n = c.productGroup;
      if (!pBefore[n]) pBefore[n] = { count: 0, revenue: 0, buyers: new Set() };
      pBefore[n].count++; pBefore[n].revenue += c.amount; pBefore[n].buyers.add(cid);
    }

    const fp = contactFirstPurchase.get(cid);
    if (fp && opt) {
      if (fp > opt) firstTimeBuyers++;
      else if (after.length > 0) repeatBuyers++;
    }
  }

  const total = processed.size;
  const cr = total > 0 ? (purchasedAfter / total) * 100 : 0;
  const avg = daysCount > 0 ? Math.round(totalDays / daysCount) : null;
  const med = daysArr.length > 0 ? daysArr.sort((a, b) => a - b)[Math.floor(daysArr.length / 2)] : null;

  const sd: Record<string, number> = { "0-7 days": 0, "8-14 days": 0, "15-30 days": 0, "31-60 days": 0, "61-90 days": 0, "90+ days": 0 };
  for (const d of daysArr) {
    if (d <= 7) sd["0-7 days"]++; else if (d <= 14) sd["8-14 days"]++;
    else if (d <= 30) sd["15-30 days"]++; else if (d <= 60) sd["31-60 days"]++;
    else if (d <= 90) sd["61-90 days"]++; else sd["90+ days"]++;
  }

  await supabase.from("funnel_performance").upsert({
    funnel_id: funnel.id,
    total_optins: total,
    purchased_after: purchasedAfter,
    purchased_before: purchasedBefore,
    never_purchased: neverPurchased,
    conversion_rate: Math.round(cr * 10) / 10,
    revenue_after: revenueAfter,
    avg_days_to_purchase: avg,
    median_days_to_purchase: med,
    first_time_buyers: firstTimeBuyers,
    repeat_buyers: repeatBuyers,
    products_after: Object.entries(pAfter).map(([n, s]) => ({ name: n, count: s.count, buyers: s.buyers.size, revenue: s.revenue })).sort((a, b) => b.revenue - a.revenue),
    products_before: Object.entries(pBefore).map(([n, s]) => ({ name: n, count: s.count, buyers: s.buyers.size, revenue: s.revenue })).sort((a, b) => b.revenue - a.revenue),
    speed_distribution: sd,
    computed_at: new Date().toISOString(),
  }, { onConflict: "funnel_id" });

  return NextResponse.json({
    funnel_id: funnel.id,
    funnel_name: funnel.name,
    total_optins: total,
    purchased_after: purchasedAfter,
    purchased_before: purchasedBefore,
    never_purchased: neverPurchased,
    conversion_rate: Math.round(cr * 10) / 10,
    revenue_after: revenueAfter,
  });
}
