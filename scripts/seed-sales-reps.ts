/**
 * Seed the sales_reps table with the known sales team.
 * Run with: npx tsx scripts/seed-sales-reps.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SALES_REPS = [
  { name: "Harrison Parker", email: "harrison@thinkmedia.com", samcart_affiliate_id: null },
  { name: "Keith Holloway", email: "keith@thinkmedia.com", samcart_affiliate_id: null },
  { name: "Eliot Hinshaw", email: "eliot@thinkmedia.com", samcart_affiliate_id: null },
  { name: "Josh", email: null, samcart_affiliate_id: null },
];

async function main() {
  console.log("=== Seeding Sales Reps ===\n");

  // Check if already seeded
  const { count } = await supabase
    .from("sales_reps")
    .select("id", { count: "exact", head: true });

  if (count && count > 0) {
    console.log(`sales_reps table already has ${count} records. Aborting to prevent duplicates.`);
    console.log("Clear the table first if you want to re-seed.");
    process.exit(0);
  }

  // Insert sales reps
  console.log(`Inserting ${SALES_REPS.length} sales reps...`);
  const { data: inserted, error } = await supabase
    .from("sales_reps")
    .insert(SALES_REPS)
    .select("id, name, email");

  if (error) {
    console.error("Failed to insert sales reps:", error.message);
    process.exit(1);
  }

  console.log(`  ✓ ${inserted.length} sales reps inserted:\n`);
  for (const rep of inserted) {
    console.log(`  • ${rep.name} (${rep.email || "no email"}) — ${rep.id}`);
  }

  console.log("\n✓ Done!");
}

main().catch((err) => {
  console.error("\n✗ Seed failed:", err);
  process.exit(1);
});
