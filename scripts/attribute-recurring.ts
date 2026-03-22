/**
 * Attribute recurring charges to sales reps.
 *
 * Logic:
 * 1. For each SamCart charge with an affiliate → match to HubSpot charge (same amount + date)
 * 2. Get the contact_id from the HubSpot match
 * 3. Find charges for that contact + same product group that are ON OR AFTER the sale date
 * 4. Attribute those to the rep (not earlier charges — rep only gets credit from their sale onward)
 *
 * Run with: npx tsx scripts/attribute-recurring.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log("=== Attribute Recurring Charges to Sales Reps ===\n");

  // 1. Get all reps with affiliate IDs
  const { data: reps } = await supabase
    .from("sales_reps")
    .select("id, name, samcart_affiliate_id, rep_type")
    .not("samcart_affiliate_id", "is", null);

  const affIdToRep = new Map<string, { id: string; name: string; type: string }>();
  for (const r of reps || []) {
    affIdToRep.set(r.samcart_affiliate_id, { id: r.id, name: r.name, type: r.rep_type });
  }
  console.log(`${affIdToRep.size} reps with affiliate IDs`);

  // 2. Get all SamCart charges with affiliate IDs
  const { data: samcartCharges } = await supabase
    .from("charges")
    .select("id, affiliate_id, product_variant, amount, charge_date, product_id")
    .eq("source_platform", "samcart")
    .not("affiliate_id", "is", null);

  console.log(`${samcartCharges?.length || 0} SamCart charges with affiliates\n`);

  // 3. Load products for group mapping
  const { data: products } = await supabase
    .from("products")
    .select("id, group_name, short_name");

  const productToGroup = new Map<string, string>();
  for (const p of products || []) {
    productToGroup.set(p.id, p.group_name || p.short_name || "Other");
  }

  // 4. For each SamCart charge, find matching HubSpot charge and attribute forward
  let matched = 0;
  let unmatched = 0;
  let totalAttributed = 0;

  // Track what we've already attributed to avoid duplicates
  const attributedChargeIds = new Set<string>();

  for (const sc of samcartCharges || []) {
    const rep = affIdToRep.get(sc.affiliate_id);
    if (!rep) continue;

    // Always attribute the SamCart charge itself to the rep
    if (!attributedChargeIds.has(sc.id)) {
      const { error } = await supabase
        .from("charge_attributions")
        .upsert(
          { charge_id: sc.id, sales_rep_id: rep.id, attribution_type: "affiliate" },
          { onConflict: "charge_id" }
        );
      if (!error) {
        totalAttributed++;
        attributedChargeIds.add(sc.id);
      }
    }

    // Find matching HubSpot charge: same amount, within ±2 days
    const dateObj = new Date(sc.charge_date);
    const daysBefore = new Date(dateObj.getTime() - 2 * 86400000).toISOString();
    const daysAfter = new Date(dateObj.getTime() + 2 * 86400000).toISOString();

    const { data: hsMatches } = await supabase
      .from("charges")
      .select("id, contact_id, product_id")
      .eq("source_platform", "hubspot")
      .eq("amount", sc.amount)
      .gte("charge_date", daysBefore)
      .lte("charge_date", daysAfter)
      .not("contact_id", "is", null)
      .limit(5);

    if (!hsMatches || hsMatches.length === 0) {
      unmatched++;
      continue;
    }

    matched++;
    const hsCharge = hsMatches[0];
    const contactId = hsCharge.contact_id;

    if (!contactId) continue;

    // Link the SamCart charge to this contact
    await supabase
      .from("charges")
      .update({ contact_id: contactId })
      .eq("id", sc.id);

    // Determine the product group
    const productGroup = sc.product_id
      ? productToGroup.get(sc.product_id) || null
      : null;

    // Find charges for this contact that are ON OR AFTER the sale date
    // (rep only gets credit from their sale onward, not earlier history)
    const saleDate = sc.charge_date;

    let query = supabase
      .from("charges")
      .select("id, product_id, amount, charge_date")
      .eq("contact_id", contactId)
      .gte("charge_date", saleDate);

    const { data: futureCharges } = await query;

    // Filter to same product group if we know it
    const chargesToAttribute = (futureCharges || []).filter((c) => {
      if (!productGroup) return true;
      const cGroup = c.product_id ? productToGroup.get(c.product_id) || "Other" : "Other";
      return cGroup === productGroup;
    });

    // Upsert attributions
    for (const c of chargesToAttribute) {
      if (attributedChargeIds.has(c.id)) continue;

      const { error } = await supabase
        .from("charge_attributions")
        .upsert(
          { charge_id: c.id, sales_rep_id: rep.id, attribution_type: "affiliate" },
          { onConflict: "charge_id" }
        );
      if (!error) {
        totalAttributed++;
        attributedChargeIds.add(c.id);
      }
    }

    if (chargesToAttribute.length > 0) {
      console.log(`  ${rep.name}: ${sc.product_variant?.slice(0, 40)} (${saleDate.slice(0, 10)}) → ${chargesToAttribute.length} charges attributed (on or after sale)`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`SamCart charges matched to HubSpot: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  console.log(`Total charges attributed: ${totalAttributed}`);
  console.log("\n✓ Done!");
}

main().catch(console.error);
