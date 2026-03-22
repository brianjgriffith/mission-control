/**
 * Set up affiliate ID mappings for sales reps + add coaches.
 * Run with: npx tsx scripts/setup-affiliates.ts
 *
 * Run AFTER migration 011 (adds rep_type column).
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
  console.log("=== Setting up affiliate mappings + coaches ===\n");

  // 1. Update sales rep affiliate IDs + ensure rep_type = 'sales'
  const salesReps = [
    { name: "Eliot Hinshaw", affiliate_id: "209171" },
    { name: "Keith Holloway", affiliate_id: "209177" },
    { name: "Harrison Parker", affiliate_id: "209190" },
    { name: "Josh", affiliate_id: "226237" },
  ];

  console.log("--- Sales Team ---");
  for (const m of salesReps) {
    const { error } = await supabase
      .from("sales_reps")
      .update({ samcart_affiliate_id: m.affiliate_id, rep_type: "sales" })
      .eq("name", m.name);
    console.log(`  ${m.name} → affiliate ${m.affiliate_id}: ${error ? error.message : "OK"}`);
  }

  // 2. Add coaches (with rep_type = 'coach')
  const coaches = [
    { name: "Steven Rosario", email: "caleb@thinkmedia.com", affiliate_id: "209172" },
    { name: "Samuel Thurman", email: "sam@thinkmedia.com", affiliate_id: "209173" },
    { name: "Alex Parker", email: "alex@thinkmedia.com", affiliate_id: "209176" },
    { name: "Melody Johnson", email: "melody@thinkmedia.com", affiliate_id: "221030" },
    { name: "Nathan Eswine", email: "nathaneswine@thinkmedia.com", affiliate_id: "214887" },
  ];

  console.log("\n--- Coaches ---");
  for (const c of coaches) {
    // Check if exists by email
    const { data: existing } = await supabase
      .from("sales_reps")
      .select("id")
      .eq("email", c.email)
      .maybeSingle();

    if (existing) {
      // Update existing with affiliate ID and rep_type
      const { error } = await supabase
        .from("sales_reps")
        .update({ samcart_affiliate_id: c.affiliate_id, rep_type: "coach", name: c.name })
        .eq("id", existing.id);
      console.log(`  ${c.name} → updated, affiliate ${c.affiliate_id}: ${error ? error.message : "OK"}`);
    } else {
      const { error } = await supabase
        .from("sales_reps")
        .insert({
          name: c.name,
          email: c.email,
          samcart_affiliate_id: c.affiliate_id,
          rep_type: "coach",
          is_active: true,
        });
      console.log(`  ${c.name} → added, affiliate ${c.affiliate_id}: ${error ? error.message : "OK"}`);
    }
  }

  // 3. Create attributions for all SamCart charges with affiliate IDs
  console.log("\n--- Creating attributions from affiliate IDs ---");

  // Get all reps with affiliate IDs
  const { data: allReps } = await supabase
    .from("sales_reps")
    .select("id, name, samcart_affiliate_id, rep_type")
    .not("samcart_affiliate_id", "is", null);

  const affIdToRepId = new Map<string, { id: string; name: string }>();
  for (const r of allReps || []) {
    if (r.samcart_affiliate_id) {
      affIdToRepId.set(r.samcart_affiliate_id, { id: r.id, name: r.name });
    }
  }
  console.log(`  ${affIdToRepId.size} affiliate ID → rep mappings`);

  // Get all charges with affiliate_id
  const { data: charges } = await supabase
    .from("charges")
    .select("id, affiliate_id")
    .not("affiliate_id", "is", null);

  let created = 0;
  let skipped = 0;

  for (const c of charges || []) {
    const rep = affIdToRepId.get(c.affiliate_id);
    if (!rep) {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from("charge_attributions")
      .upsert(
        { charge_id: c.id, sales_rep_id: rep.id, attribution_type: "affiliate" },
        { onConflict: "charge_id" }
      );

    if (!error) created++;
  }

  console.log(`  Charges with affiliates: ${charges?.length || 0}`);
  console.log(`  Attributions created/updated: ${created}`);
  console.log(`  Skipped (unknown affiliate): ${skipped}`);

  // Summary
  console.log("\n--- Summary ---");
  const { data: finalReps } = await supabase
    .from("sales_reps")
    .select("name, rep_type, samcart_affiliate_id")
    .eq("is_active", true)
    .order("rep_type")
    .order("name");

  for (const r of finalReps || []) {
    console.log(`  [${r.rep_type}] ${r.name} — affiliate: ${r.samcart_affiliate_id || "none"}`);
  }

  console.log("\n✓ Done!");
}

main().catch(console.error);
