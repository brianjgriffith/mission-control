/**
 * Compute multi-touch funnel paths.
 *
 * Pass 1: Build a map of email → all funnels they're in (with addedAt dates)
 * Pass 2: For each contact who purchased, reconstruct their funnel journey
 * Pass 3: Aggregate path stats per funnel
 *
 * Run with: npx tsx scripts/compute-funnel-paths.ts
 * Run AFTER compute-funnel-performance.ts (needs funnel data)
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
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function hubspotGet(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` } });
  if (res.status === 429) { await sleep(10000); return hubspotGet(url); }
  if (!res.ok) throw new Error(`HubSpot ${res.status}`);
  return res.json();
}

async function main() {
  console.log("=== Compute Multi-Touch Funnel Paths ===\n");

  // Load funnels
  const { data: funnels } = await supabase
    .from("funnels")
    .select("id, name, funnel_type, hubspot_list_id")
    .eq("is_active", true)
    .not("hubspot_list_id", "is", null);

  console.log(`${funnels?.length} funnels`);

  // Load contacts
  console.log("Loading contacts...");
  const emailToContactId = new Map<string, string>();
  let offset = 0;
  while (true) {
    const { data: batch } = await supabase.from("contacts").select("id, email").neq("email", "").range(offset, offset + 999);
    if (!batch?.length) break;
    for (const c of batch) emailToContactId.set(c.email.toLowerCase(), c.id);
    offset += batch.length;
    if (batch.length < 1000) break;
  }
  console.log(`  ${emailToContactId.size} contacts`);

  // Load products
  const { data: products } = await supabase.from("products").select("id, group_name, short_name");
  const productGroupMap = new Map<string, string>();
  for (const p of products || []) productGroupMap.set(p.id, p.group_name || p.short_name || "Other");

  // Load charges (first charge per contact for speed)
  console.log("Loading charges...");
  const contactFirstPurchase = new Map<string, { date: Date; amount: number; product: string }>();
  let cOffset = 0;
  while (true) {
    const { data: batch } = await supabase
      .from("charges")
      .select("contact_id, amount, charge_date, product_id")
      .gt("amount", 0)
      .order("charge_date", { ascending: true })
      .range(cOffset, cOffset + 999);
    if (!batch?.length) break;
    for (const c of batch) {
      if (!c.contact_id) continue;
      if (!contactFirstPurchase.has(c.contact_id)) {
        contactFirstPurchase.set(c.contact_id, {
          date: new Date(c.charge_date),
          amount: Number(c.amount),
          product: c.product_id ? (productGroupMap.get(c.product_id) || "Other") : "Other",
        });
      }
    }
    cOffset += batch.length;
    if (batch.length < 1000) break;
  }
  console.log(`  ${contactFirstPurchase.size} contacts with purchases`);

  // ---- Pass 1: Build email → funnels map ----
  console.log("\nPass 1: Building email → funnels map...");

  interface FunnelTouch {
    funnel_id: string;
    funnel_name: string;
    funnel_type: string;
    added_at: number; // timestamp
  }

  const emailToFunnels = new Map<string, FunnelTouch[]>();

  for (let i = 0; i < (funnels?.length || 0); i++) {
    const funnel = funnels![i];
    process.stdout.write(`  [${i + 1}/${funnels!.length}] ${funnel.name.slice(0, 45)}...`);

    let listContacts = 0;
    let hasMore = true;
    let vidOffset = 0;

    while (hasMore) {
      try {
        const data = await hubspotGet(
          `https://api.hubapi.com/contacts/v1/lists/${funnel.hubspot_list_id}/contacts/all?count=100&vidOffset=${vidOffset}&property=email`
        );
        for (const c of data.contacts || []) {
          const email = c.properties?.email?.value?.toLowerCase() || "";
          const addedAt = c.addedAt || 0;
          if (email && addedAt > 0) {
            if (!emailToFunnels.has(email)) emailToFunnels.set(email, []);
            emailToFunnels.get(email)!.push({
              funnel_id: funnel.id,
              funnel_name: funnel.name,
              funnel_type: funnel.funnel_type,
              added_at: addedAt,
            });
            listContacts++;
          }
        }
        hasMore = data["has-more"] || false;
        vidOffset = data["vid-offset"] || 0;
        await sleep(RATE_LIMIT_MS);
      } catch {
        hasMore = false;
      }
    }
    console.log(` ${listContacts} contacts`);
  }

  console.log(`\nTotal unique emails across all funnels: ${emailToFunnels.size}`);

  // ---- Pass 2: Build contact journey paths ----
  console.log("\nPass 2: Building contact journey paths...");

  const pathRows: any[] = [];
  let purchasersWithPaths = 0;

  for (const [email, touches] of emailToFunnels) {
    const contactId = emailToContactId.get(email);
    if (!contactId) continue;

    const purchase = contactFirstPurchase.get(contactId);
    if (!purchase) continue;

    // Sort touches by date
    const sorted = touches
      .sort((a, b) => a.added_at - b.added_at)
      // Dedupe by funnel_id
      .filter((t, i, arr) => arr.findIndex((a) => a.funnel_id === t.funnel_id) === i);

    // Only count funnels touched BEFORE the first purchase
    const beforePurchase = sorted.filter((t) => new Date(t.added_at) < purchase.date);

    if (beforePurchase.length === 0) continue;

    const firstFunnelDate = new Date(beforePurchase[0].added_at);
    const daysToP = Math.round((purchase.date.getTime() - firstFunnelDate.getTime()) / 86400000);

    pathRows.push({
      contact_id: contactId,
      email,
      funnels_touched: beforePurchase.map((t) => ({
        funnel_id: t.funnel_id,
        funnel_name: t.funnel_name,
        added_at: new Date(t.added_at).toISOString(),
      })),
      total_funnels: beforePurchase.length,
      first_funnel_date: firstFunnelDate.toISOString(),
      first_purchase_date: purchase.date.toISOString(),
      days_to_purchase: daysToP,
      first_purchase_amount: purchase.amount,
      first_purchase_product: purchase.product,
      computed_at: new Date().toISOString(),
    });

    purchasersWithPaths++;
  }

  console.log(`${purchasersWithPaths} purchasers with funnel paths`);

  // Store paths
  console.log("\nStoring contact paths...");
  for (let i = 0; i < pathRows.length; i += 100) {
    const batch = pathRows.slice(i, i + 100);
    await supabase.from("contact_funnel_paths").upsert(batch, { onConflict: "contact_id" });
  }
  console.log(`  ${pathRows.length} paths stored`);

  // ---- Pass 3: Aggregate per funnel ----
  console.log("\nPass 3: Aggregating per-funnel stats...");

  for (const funnel of funnels || []) {
    // Find all purchasers who touched this funnel before buying
    const funnelPurchasers = pathRows.filter((p) =>
      p.funnels_touched.some((t: any) => t.funnel_id === funnel.id)
    );

    if (funnelPurchasers.length === 0) continue;

    // Average funnels before purchase
    const avgFunnels = funnelPurchasers.reduce((s, p) => s + p.total_funnels, 0) / funnelPurchasers.length;

    // Touch count distribution
    const touchDist: Record<string, number> = {
      "1 funnel": 0,
      "2 funnels": 0,
      "3-4 funnels": 0,
      "5-7 funnels": 0,
      "8+ funnels": 0,
    };
    for (const p of funnelPurchasers) {
      if (p.total_funnels === 1) touchDist["1 funnel"]++;
      else if (p.total_funnels === 2) touchDist["2 funnels"]++;
      else if (p.total_funnels <= 4) touchDist["3-4 funnels"]++;
      else if (p.total_funnels <= 7) touchDist["5-7 funnels"]++;
      else touchDist["8+ funnels"]++;
    }

    // Most common other funnels in the path (co-occurrence)
    const coFunnelCounts: Record<string, number> = {};
    for (const p of funnelPurchasers) {
      for (const t of p.funnels_touched) {
        if (t.funnel_id === funnel.id) continue;
        coFunnelCounts[t.funnel_name] = (coFunnelCounts[t.funnel_name] || 0) + 1;
      }
    }
    const commonPaths = Object.entries(coFunnelCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count, pct: Math.round((count / funnelPurchasers.length) * 100) }));

    // Update funnel_performance
    await supabase
      .from("funnel_performance")
      .update({
        avg_funnels_before_purchase: Math.round(avgFunnels * 10) / 10,
        touch_distribution: touchDist,
        common_paths: commonPaths,
      })
      .eq("funnel_id", funnel.id);
  }

  console.log("\n✓ Done! Multi-touch paths computed.");
}

main().catch(console.error);
