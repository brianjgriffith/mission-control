/**
 * Compute funnel performance for all imported funnels.
 * Pulls ALL contacts from each HubSpot list (no limit), cross-references
 * with charges, and stores results in funnel_performance table.
 *
 * Run with: npx tsx scripts/compute-funnel-performance.ts
 * Takes ~5-10 minutes for 84 funnels with large lists.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY!;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RATE_LIMIT_MS = 120;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function hubspotGet(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` },
  });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") || "10", 10);
    console.log(`    Rate limited, waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return hubspotGet(url);
  }
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log("=== Compute Funnel Performance ===\n");

  // Load all funnels
  const { data: funnels } = await supabase
    .from("funnels")
    .select("id, name, funnel_type, hubspot_list_id")
    .eq("is_active", true)
    .not("hubspot_list_id", "is", null);

  console.log(`${funnels?.length} funnels to process\n`);

  // Pre-load all contacts from Supabase (paginate in 1000-row chunks due to Supabase max_rows)
  console.log("Loading contacts from Supabase...");
  const emailToContactId = new Map<string, string>();
  let contactOffset = 0;
  while (true) {
    const { data: batch } = await supabase
      .from("contacts")
      .select("id, email")
      .neq("email", "")
      .range(contactOffset, contactOffset + 999);
    if (!batch || batch.length === 0) break;
    for (const c of batch) {
      emailToContactId.set(c.email.toLowerCase(), c.id);
    }
    contactOffset += batch.length;
    if (batch.length < 1000) break;
  }
  console.log(`  ${emailToContactId.size} contacts loaded`);

  // Pre-load all products for group lookup
  const { data: products } = await supabase.from("products").select("id, group_name, short_name");
  const productGroupMap = new Map<string, string>();
  for (const p of products || []) {
    productGroupMap.set(p.id, p.group_name || p.short_name || "Other");
  }

  // Pre-load all charges (paginate in 1000-row chunks)
  console.log("Loading charges from Supabase...");
  const allCharges: any[] = [];
  let chargeOffset = 0;
  while (true) {
    const { data: batch } = await supabase
      .from("charges")
      .select("contact_id, amount, charge_date, product_id")
      .gt("amount", 0)
      .order("charge_date", { ascending: true })
      .range(chargeOffset, chargeOffset + 999);
    if (!batch || batch.length === 0) break;
    allCharges.push(...batch);
    chargeOffset += batch.length;
    if (batch.length < 1000) break;
  }

  const chargesByContact = new Map<string, Array<{ amount: number; date: Date; productGroup: string }>>();
  for (const c of allCharges || []) {
    if (!c.contact_id) continue;
    if (!chargesByContact.has(c.contact_id)) chargesByContact.set(c.contact_id, []);
    chargesByContact.get(c.contact_id)!.push({
      amount: Number(c.amount) || 0,
      date: new Date(c.charge_date),
      productGroup: c.product_id ? (productGroupMap.get(c.product_id) || "Other") : "Other",
    });
  }
  console.log(`  ${allCharges?.length} charges loaded across ${chargesByContact.size} contacts\n`);

  // Find each contact's first-ever purchase date (for "first product" tracking)
  const contactFirstPurchase = new Map<string, Date>();
  for (const [contactId, charges] of chargesByContact) {
    const sorted = charges.sort((a, b) => a.date.getTime() - b.date.getTime());
    if (sorted.length > 0) contactFirstPurchase.set(contactId, sorted[0].date);
  }

  // Process each funnel
  for (let i = 0; i < (funnels?.length || 0); i++) {
    const funnel = funnels![i];
    process.stdout.write(`[${i + 1}/${funnels!.length}] ${funnel.name.slice(0, 50)}...`);

    // Pull ALL contacts from HubSpot list
    const listContacts: Array<{ email: string; addedAt: number }> = [];
    let hasMore = true;
    let vidOffset = 0;

    while (hasMore) {
      try {
        const data = await hubspotGet(
          `https://api.hubapi.com/contacts/v1/lists/${funnel.hubspot_list_id}/contacts/all?count=100&vidOffset=${vidOffset}&property=email`
        );

        for (const c of data.contacts || []) {
          const email = c.properties?.email?.value || "";
          const addedAt = c.addedAt || 0;
          if (email) listContacts.push({ email: email.toLowerCase(), addedAt });
        }

        hasMore = data["has-more"] || false;
        vidOffset = data["vid-offset"] || 0;
        await sleep(RATE_LIMIT_MS);
      } catch (err) {
        console.log(` ERROR: ${(err as Error).message}`);
        hasMore = false;
      }
    }

    // Analyze
    let purchasedAfter = 0;
    let purchasedBefore = 0;
    let neverPurchased = 0;
    let revenueAfter = 0;
    let totalDays = 0;
    let daysCount = 0;
    let firstTimeBuyers = 0;
    let repeatBuyers = 0;
    const daysToFirstPurchase: number[] = [];
    const productsAfter: Record<string, { count: number; revenue: number; buyers: Set<string> }> = {};
    const productsBefore: Record<string, { count: number; revenue: number; buyers: Set<string> }> = {};

    const processedEmails = new Set<string>();

    for (const lc of listContacts) {
      if (processedEmails.has(lc.email)) continue;
      processedEmails.add(lc.email);

      const contactId = emailToContactId.get(lc.email);
      if (!contactId) {
        neverPurchased++;
        continue;
      }

      const charges = chargesByContact.get(contactId);
      if (!charges || charges.length === 0) {
        neverPurchased++;
        continue;
      }

      const optinDate = lc.addedAt > 0 ? new Date(lc.addedAt) : null;

      if (!optinDate) {
        purchasedBefore++;
        continue;
      }

      const afterCharges = charges.filter((c) => c.date > optinDate);
      const beforeCharges = charges.filter((c) => c.date <= optinDate);

      if (afterCharges.length > 0) {
        purchasedAfter++;
        revenueAfter += afterCharges.reduce((s, c) => s + c.amount, 0);

        // Speed to first post-opt-in purchase
        const firstAfter = afterCharges.sort((a, b) => a.date.getTime() - b.date.getTime())[0];
        const days = Math.round(
          (firstAfter.date.getTime() - optinDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        totalDays += days;
        daysCount++;
        daysToFirstPurchase.push(days);

        // Product breakdown (after)
        for (const c of afterCharges) {
          const name = c.productGroup || "Other";
          if (!productsAfter[name]) productsAfter[name] = { count: 0, revenue: 0, buyers: new Set() };
          productsAfter[name].count++;
          productsAfter[name].revenue += c.amount;
          productsAfter[name].buyers.add(contactId);
        }
      } else if (beforeCharges.length > 0) {
        purchasedBefore++;
      } else {
        neverPurchased++;
      }

      // Product breakdown (before)
      for (const c of beforeCharges) {
        const name = c.productGroup || "Other";
        if (!productsBefore[name]) productsBefore[name] = { count: 0, revenue: 0, buyers: new Set() };
        productsBefore[name].count++;
        productsBefore[name].revenue += c.amount;
        if (contactId) productsBefore[name].buyers.add(contactId);
      }

      // First-time buyer tracking
      const firstPurchaseDate = contactFirstPurchase.get(contactId);
      if (firstPurchaseDate && optinDate) {
        if (firstPurchaseDate > optinDate) {
          firstTimeBuyers++;
        } else {
          if (afterCharges.length > 0) {
            repeatBuyers++;
          }
        }
      }
    }

    const totalOptins = processedEmails.size;
    const conversionRate = totalOptins > 0 ? (purchasedAfter / totalOptins) * 100 : 0;
    const avgDays = daysCount > 0 ? Math.round(totalDays / daysCount) : null;
    const medianDays = daysToFirstPurchase.length > 0
      ? daysToFirstPurchase.sort((a, b) => a - b)[Math.floor(daysToFirstPurchase.length / 2)]
      : null;

    // Speed distribution buckets
    const speedDist = {
      "0-7 days": 0, "8-14 days": 0, "15-30 days": 0,
      "31-60 days": 0, "61-90 days": 0, "90+ days": 0,
    };
    for (const d of daysToFirstPurchase) {
      if (d <= 7) speedDist["0-7 days"]++;
      else if (d <= 14) speedDist["8-14 days"]++;
      else if (d <= 30) speedDist["15-30 days"]++;
      else if (d <= 60) speedDist["31-60 days"]++;
      else if (d <= 90) speedDist["61-90 days"]++;
      else speedDist["90+ days"]++;
    }

    // Sort product breakdowns (include unique buyer count)
    const sortedAfter = Object.entries(productsAfter)
      .map(([name, s]) => ({ name, count: s.count, buyers: s.buyers.size, revenue: s.revenue }))
      .sort((a, b) => b.revenue - a.revenue);
    const sortedBefore = Object.entries(productsBefore)
      .map(([name, s]) => ({ name, count: s.count, buyers: s.buyers.size, revenue: s.revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    // Upsert result
    await supabase.from("funnel_performance").upsert(
      {
        funnel_id: funnel.id,
        total_optins: totalOptins,
        purchased_after: purchasedAfter,
        purchased_before: purchasedBefore,
        never_purchased: neverPurchased,
        conversion_rate: Math.round(conversionRate * 10) / 10,
        revenue_after: revenueAfter,
        avg_days_to_purchase: avgDays,
        median_days_to_purchase: medianDays,
        first_time_buyers: firstTimeBuyers,
        repeat_buyers: repeatBuyers,
        products_after: sortedAfter,
        products_before: sortedBefore,
        speed_distribution: speedDist,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "funnel_id" }
    );

    console.log(` ${totalOptins} optins, ${purchasedAfter} converted (${conversionRate.toFixed(1)}%), $${revenueAfter.toLocaleString()}`);
  }

  console.log("\n✓ Done! Results cached in funnel_performance table.");
}

main().catch(console.error);
