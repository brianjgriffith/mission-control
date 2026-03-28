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

  // Pre-load all contacts from Supabase for fast lookup
  console.log("Loading contacts from Supabase...");
  const { data: allContacts } = await supabase
    .from("contacts")
    .select("id, email")
    .neq("email", "");

  const emailToContactId = new Map<string, string>();
  for (const c of allContacts || []) {
    emailToContactId.set(c.email.toLowerCase(), c.id);
  }
  console.log(`  ${emailToContactId.size} contacts loaded`);

  // Pre-load all charges grouped by contact_id
  console.log("Loading charges from Supabase...");
  const { data: allCharges } = await supabase
    .from("charges")
    .select("contact_id, amount, charge_date")
    .gt("amount", 0)
    .order("charge_date", { ascending: true });

  const chargesByContact = new Map<string, Array<{ amount: number; date: Date }>>();
  for (const c of allCharges || []) {
    if (!c.contact_id) continue;
    if (!chargesByContact.has(c.contact_id)) chargesByContact.set(c.contact_id, []);
    chargesByContact.get(c.contact_id)!.push({
      amount: Number(c.amount) || 0,
      date: new Date(c.charge_date),
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
      } else if (beforeCharges.length > 0) {
        purchasedBefore++;
      } else {
        neverPurchased++;
      }

      // First-time buyer tracking
      const firstPurchaseDate = contactFirstPurchase.get(contactId);
      if (firstPurchaseDate && optinDate) {
        // Was their first-ever purchase AFTER joining this funnel?
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
        first_time_buyers: firstTimeBuyers,
        repeat_buyers: repeatBuyers,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "funnel_id" }
    );

    console.log(` ${totalOptins} optins, ${purchasedAfter} converted (${conversionRate.toFixed(1)}%), $${revenueAfter.toLocaleString()}`);
  }

  console.log("\n✓ Done! Results cached in funnel_performance table.");
}

main().catch(console.error);
