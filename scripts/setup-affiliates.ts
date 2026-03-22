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

  // 1. Update sales rep affiliate IDs
  const repMappings = [
    { name: "Eliot Hinshaw", affiliate_id: "209171" },
    { name: "Keith Holloway", affiliate_id: "209177" },
    { name: "Harrison Parker", affiliate_id: "209190" },
    { name: "Josh", affiliate_id: "226237" },
  ];

  for (const m of repMappings) {
    const { error } = await supabase
      .from("sales_reps")
      .update({ samcart_affiliate_id: m.affiliate_id, rep_type: "sales" })
      .eq("name", m.name);
    console.log(`  ${m.name} → affiliate ${m.affiliate_id}: ${error ? error.message : "OK"}`);
  }

  // 2. Add coaches (with rep_type = 'coach')
  const coaches = [
    { name: "Caleb Rosario", email: "caleb@thinkmedia.com" },
    { name: "Sam Think Media", email: "sam@thinkmedia.com" },
    { name: "Alex Parker", email: "alex@thinkmedia.com" },
    { name: "Melody Johnson", email: "melody@thinkmedia.com" },
    { name: "Molly Jackson", email: "molly@thinkmediacoaching.com" },
    { name: "Nathan Eswine", email: "nathaneswine@thinkmedia.com" },
  ];

  for (const c of coaches) {
    const { data: existing } = await supabase
      .from("sales_reps")
      .select("id")
      .eq("email", c.email)
      .maybeSingle();

    if (existing) {
      console.log(`  ${c.name} — already exists, skipping`);
      continue;
    }

    const { error } = await supabase
      .from("sales_reps")
      .insert({
        name: c.name,
        email: c.email,
        rep_type: "coach",
        is_active: true,
      });
    console.log(`  ${c.name} (coach) → ${error ? error.message : "added"}`);
  }

  // 3. Now create attributions for all SamCart charges with affiliate IDs
  console.log("\n--- Creating attributions from affiliate IDs ---");

  // Get all sales reps with affiliate IDs
  const { data: reps } = await supabase
    .from("sales_reps")
    .select("id, name, samcart_affiliate_id")
    .not("samcart_affiliate_id", "is", null);

  const affIdToRepId = new Map<string, string>();
  for (const r of reps || []) {
    if (r.samcart_affiliate_id) {
      affIdToRepId.set(r.samcart_affiliate_id, r.id);
    }
  }
  console.log(`  ${affIdToRepId.size} affiliate ID → rep mappings`);

  // Get all SamCart charges with affiliate_id but no attribution
  const { data: charges } = await supabase
    .from("charges")
    .select("id, affiliate_id")
    .eq("source_platform", "samcart")
    .not("affiliate_id", "is", null);

  let created = 0;
  let skipped = 0;

  for (const c of charges || []) {
    const repId = affIdToRepId.get(c.affiliate_id);
    if (!repId) {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from("charge_attributions")
      .upsert(
        { charge_id: c.id, sales_rep_id: repId, attribution_type: "affiliate" },
        { onConflict: "charge_id" }
      );

    if (error) {
      console.error(`  Error attributing charge ${c.id}: ${error.message}`);
    } else {
      created++;
    }
  }

  console.log(`  Attributions created: ${created}`);
  console.log(`  Skipped (unknown affiliate): ${skipped}`);

  console.log("\n✓ Done!");
}

main().catch(console.error);
