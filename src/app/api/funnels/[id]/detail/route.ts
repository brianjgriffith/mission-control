import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY!;
const RATE_LIMIT_MS = 120;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function hubspotGet(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` },
  });
  if (res.status === 429) {
    await sleep(10000);
    return hubspotGet(url);
  }
  if (!res.ok) throw new Error(`HubSpot ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// GET /api/funnels/[id]/detail
// Deep dive into a single funnel — what people bought before/after,
// product breakdown, speed to purchase, multi-funnel paths.
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // Get the funnel
    const { data: funnel, error: funnelError } = await supabase
      .from("funnels")
      .select("id, name, funnel_type, hubspot_list_id")
      .eq("id", id)
      .single();

    if (funnelError || !funnel) {
      return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
    }

    // Pull contacts from HubSpot list (up to 2000 for detail view)
    const listContacts: Array<{ email: string; addedAt: number }> = [];
    let hasMore = true;
    let vidOffset = 0;

    while (hasMore && listContacts.length < 2000) {
      const data = await hubspotGet(
        `https://api.hubapi.com/contacts/v1/lists/${funnel.hubspot_list_id}/contacts/all?count=100&vidOffset=${vidOffset}&property=email`
      );
      for (const c of data.contacts || []) {
        const email = c.properties?.email?.value || "";
        if (email) listContacts.push({ email: email.toLowerCase(), addedAt: c.addedAt || 0 });
      }
      hasMore = data["has-more"] || false;
      vidOffset = data["vid-offset"] || 0;
      await sleep(RATE_LIMIT_MS);
    }

    // Load contacts from Supabase
    const emails = listContacts.map((c) => c.email);
    const emailToContactId = new Map<string, string>();

    for (let i = 0; i < emails.length; i += 50) {
      const batch = emails.slice(i, i + 50);
      const { data: dbContacts } = await supabase
        .from("contacts")
        .select("id, email")
        .in("email", batch);
      for (const c of dbContacts || []) {
        emailToContactId.set(c.email.toLowerCase(), c.id);
      }
    }

    // Build email → addedAt map
    const emailAddedAt = new Map<string, Date>();
    for (const c of listContacts) {
      if (c.addedAt > 0) emailAddedAt.set(c.email, new Date(c.addedAt));
    }

    // Load all charges for matched contacts
    const contactIds = [...new Set(emailToContactId.values())];
    const chargesByContact = new Map<string, any[]>();

    for (let i = 0; i < contactIds.length; i += 50) {
      const batch = contactIds.slice(i, i + 50);
      const { data: charges } = await supabase
        .from("charges")
        .select("contact_id, amount, charge_date, product_id, products(short_name, group_name)")
        .in("contact_id", batch)
        .gt("amount", 0)
        .order("charge_date", { ascending: true });

      for (const c of charges || []) {
        if (!chargesByContact.has(c.contact_id)) chargesByContact.set(c.contact_id, []);
        chargesByContact.get(c.contact_id)!.push(c);
      }
    }

    // Load all funnels for multi-path analysis
    const { data: allFunnels } = await supabase
      .from("funnels")
      .select("id, name, hubspot_list_id")
      .eq("is_active", true);

    // Analyze each contact
    const productsAfter: Record<string, { count: number; revenue: number }> = {};
    const productsBefore: Record<string, { count: number; revenue: number }> = {};
    const daysToFirstPurchase: number[] = [];
    const purchasersAfter: Array<{
      email: string;
      product: string;
      amount: number;
      charge_date: string;
      days_after: number;
    }> = [];

    const processedEmails = new Set<string>();
    let totalAfter = 0;
    let totalBefore = 0;
    let neverPurchased = 0;

    for (const lc of listContacts) {
      if (processedEmails.has(lc.email)) continue;
      processedEmails.add(lc.email);

      const contactId = emailToContactId.get(lc.email);
      if (!contactId) { neverPurchased++; continue; }

      const charges = chargesByContact.get(contactId);
      if (!charges || charges.length === 0) { neverPurchased++; continue; }

      const optinDate = emailAddedAt.get(lc.email);
      if (!optinDate) { totalBefore++; continue; }

      const after = charges.filter((c: any) => new Date(c.charge_date) > optinDate);
      const before = charges.filter((c: any) => new Date(c.charge_date) <= optinDate);

      if (after.length > 0) {
        totalAfter++;

        // First purchase speed
        const firstAfter = after[0];
        const days = Math.round(
          (new Date(firstAfter.charge_date).getTime() - optinDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        daysToFirstPurchase.push(days);

        // Product breakdown (after)
        for (const c of after) {
          const name = (c as any).products?.group_name || (c as any).products?.short_name || "Other";
          if (!productsAfter[name]) productsAfter[name] = { count: 0, revenue: 0 };
          productsAfter[name].count++;
          productsAfter[name].revenue += Number(c.amount) || 0;
        }

        // Individual purchaser details (first 100)
        if (purchasersAfter.length < 100) {
          purchasersAfter.push({
            email: lc.email,
            product: (firstAfter as any).products?.group_name || (firstAfter as any).products?.short_name || "Other",
            amount: Number(firstAfter.amount) || 0,
            charge_date: firstAfter.charge_date,
            days_after: days,
          });
        }
      } else {
        totalBefore++;
      }

      // Product breakdown (before)
      for (const c of before) {
        const name = (c as any).products?.group_name || (c as any).products?.short_name || "Other";
        if (!productsBefore[name]) productsBefore[name] = { count: 0, revenue: 0 };
        productsBefore[name].count++;
        productsBefore[name].revenue += Number(c.amount) || 0;
      }
    }

    // Speed distribution buckets
    const speedBuckets = {
      "0-7 days": 0,
      "8-14 days": 0,
      "15-30 days": 0,
      "31-60 days": 0,
      "61-90 days": 0,
      "90+ days": 0,
    };
    for (const d of daysToFirstPurchase) {
      if (d <= 7) speedBuckets["0-7 days"]++;
      else if (d <= 14) speedBuckets["8-14 days"]++;
      else if (d <= 30) speedBuckets["15-30 days"]++;
      else if (d <= 60) speedBuckets["31-60 days"]++;
      else if (d <= 90) speedBuckets["61-90 days"]++;
      else speedBuckets["90+ days"]++;
    }

    const avgDays = daysToFirstPurchase.length > 0
      ? Math.round(daysToFirstPurchase.reduce((a, b) => a + b, 0) / daysToFirstPurchase.length)
      : null;
    const medianDays = daysToFirstPurchase.length > 0
      ? daysToFirstPurchase.sort((a, b) => a - b)[Math.floor(daysToFirstPurchase.length / 2)]
      : null;

    // Sort product breakdowns by revenue
    const sortedAfter = Object.entries(productsAfter)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.revenue - a.revenue);

    const sortedBefore = Object.entries(productsBefore)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.revenue - a.revenue);

    // Sort purchasers by amount desc
    purchasersAfter.sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      funnel,
      summary: {
        total_optins: processedEmails.size,
        purchased_after: totalAfter,
        purchased_before: totalBefore,
        never_purchased: neverPurchased,
        conversion_rate: processedEmails.size > 0
          ? Math.round((totalAfter / processedEmails.size) * 1000) / 10
          : 0,
        total_revenue_after: sortedAfter.reduce((s, p) => s + p.revenue, 0),
      },
      products_after: sortedAfter,
      products_before: sortedBefore,
      speed: {
        avg_days: avgDays,
        median_days: medianDays,
        distribution: speedBuckets,
      },
      recent_purchasers: purchasersAfter.slice(0, 50),
    });
  } catch (error) {
    console.error("[GET /api/funnels/[id]/detail]", error);
    return NextResponse.json(
      { error: "Failed to load funnel detail" },
      { status: 500 }
    );
  }
}
