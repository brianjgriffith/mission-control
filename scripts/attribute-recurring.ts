/**
 * Attribute recurring charges to sales reps by matching SamCart affiliate
 * orders to HubSpot charges (same amount + date), then attributing all
 * charges for the same contact + product group to that rep.
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

  // 4. For each SamCart charge, find matching HubSpot charge and get contact
  let matched = 0;
  let unmatched = 0;
  let totalAttributed = 0;

  const processedContacts = new Set<string>(); // Avoid double-processing

  for (const sc of samcartCharges || []) {
    const rep = affIdToRep.get(sc.affiliate_id);
    if (!rep) continue;

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
    const hsCharge = hsMatches[0]; // Take first match
    const contactId = hsCharge.contact_id;

    if (!contactId || processedContacts.has(contactId)) continue;
    processedContacts.add(contactId);

    // Determine the product group
    const productGroup = sc.product_id
      ? productToGroup.get(sc.product_id) || "Other"
      : null;

    // 5. Find ALL charges for this contact (across all platforms)
    // If we know the product group, only attribute same-group charges
    let query = supabase
      .from("charges")
      .select("id, product_id, amount")
      .eq("contact_id", contactId);

    const { data: contactCharges } = await query;

    // Filter to same product group if we know it
    const chargesToAttribute = (contactCharges || []).filter((c) => {
      if (!productGroup) return true; // no group = attribute all
      const cGroup = c.product_id ? productToGroup.get(c.product_id) || "Other" : "Other";
      return cGroup === productGroup;
    });

    // 6. Upsert attributions for all matching charges
    for (const c of chargesToAttribute) {
      const { error } = await supabase
        .from("charge_attributions")
        .upsert(
          { charge_id: c.id, sales_rep_id: rep.id, attribution_type: "affiliate" },
          { onConflict: "charge_id" }
        );
      if (!error) totalAttributed++;
    }

    if (chargesToAttribute.length > 0) {
      console.log(`  ${rep.name}: ${sc.product_variant?.slice(0, 40)} → contact matched → ${chargesToAttribute.length} charges attributed`);
    }
  }

  // Also update the SamCart charges themselves with the matched contact_id
  console.log("\n--- Linking SamCart charges to contacts ---");
  let linked = 0;
  for (const sc of samcartCharges || []) {
    const dateObj = new Date(sc.charge_date);
    const daysBefore = new Date(dateObj.getTime() - 2 * 86400000).toISOString();
    const daysAfter = new Date(dateObj.getTime() + 2 * 86400000).toISOString();

    const { data: hsMatch } = await supabase
      .from("charges")
      .select("contact_id")
      .eq("source_platform", "hubspot")
      .eq("amount", sc.amount)
      .gte("charge_date", daysBefore)
      .lte("charge_date", daysAfter)
      .not("contact_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (hsMatch?.contact_id) {
      await supabase
        .from("charges")
        .update({ contact_id: hsMatch.contact_id })
        .eq("id", sc.id);
      linked++;
    }
  }

  console.log(`  Linked ${linked} SamCart charges to contacts`);

  console.log("\n=== Summary ===");
  console.log(`SamCart charges matched to HubSpot: ${matched}`);
  console.log(`Unmatched (no HubSpot counterpart): ${unmatched}`);
  console.log(`Total charges attributed to reps: ${totalAttributed}`);
  console.log(`Unique contacts processed: ${processedContacts.size}`);
  console.log("\n✓ Done!");
}

main().catch(console.error);
