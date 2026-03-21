/**
 * Seed the products and product_title_mappings tables in Supabase.
 * Run with: npx tsx scripts/seed-products.ts
 *
 * Based on actual HubSpot charge title patterns observed in production data.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ProductSeed {
  name: string;
  short_name: string;
  product_type: string;
  program: string | null;
  default_price: number | null;
}

interface MappingSeed {
  product_name: string; // references products.name
  title_pattern: string;
  match_type: "contains" | "starts_with" | "regex";
  priority: number;
}

// ---- Canonical Products ----
const PRODUCTS: ProductSeed[] = [
  // Coaching programs
  { name: "Think Media Accelerator", short_name: "Accelerator", product_type: "coaching", program: "accelerator", default_price: null },
  { name: "VRA Elite", short_name: "Elite", product_type: "coaching", program: "elite", default_price: 297 },

  // VRA (Video Ranking Academy) products
  { name: "Video Ranking Academy", short_name: "VRA", product_type: "course", program: null, default_price: null },
  { name: "VRA Membership - Monthly", short_name: "VRA Monthly", product_type: "membership", program: null, default_price: 97 },
  { name: "VRA Membership - Annual", short_name: "VRA Annual", product_type: "membership", program: null, default_price: null },
  { name: "VRA Base Lifetime", short_name: "VRA Lifetime", product_type: "membership", program: null, default_price: null },
  { name: "VRA Bundle", short_name: "VRA Bundle", product_type: "course", program: null, default_price: null },
  { name: "VRA Accelerator Setup", short_name: "VRA Accel Setup", product_type: "course", program: null, default_price: null },

  // YouTube courses & bundles
  { name: "YouTube Course & Coaching Bundle", short_name: "YT Coaching Bundle", product_type: "course", program: null, default_price: 97 },
  { name: "Video Ranking Academy Course & Coaching Bundle", short_name: "VRA Coaching Bundle", product_type: "course", program: null, default_price: 97 },
  { name: "Video Ranking Academy Course & Coaching Membership", short_name: "VRA Coaching Membership", product_type: "membership", program: null, default_price: 97 },
  { name: "YouTube Secrets", short_name: "YT Secrets", product_type: "course", program: null, default_price: null },
  { name: "YouTube Starter Kit", short_name: "YT Starter Kit", product_type: "course", program: null, default_price: 27 },
  { name: "YouTube Money Secrets", short_name: "YT Money Secrets", product_type: "course", program: null, default_price: 97 },

  // Events & challenges
  { name: "YouTube 1K Challenge", short_name: "1K Challenge", product_type: "event", program: null, default_price: null },
  { name: "YouTube Growth Day", short_name: "Growth Day", product_type: "event", program: null, default_price: null },
  { name: "Holiday Bundle", short_name: "Holiday Bundle", product_type: "course", program: null, default_price: 47 },
  { name: "YouTube Growth Bundle", short_name: "Growth Bundle", product_type: "course", program: null, default_price: null },

  // Legacy / other
  { name: "Legacy Inner Circle Membership", short_name: "Legacy IC", product_type: "membership", program: null, default_price: 19 },
  { name: "Video Success Secrets", short_name: "VSS", product_type: "course", program: null, default_price: null },
  { name: "Camera Confidence Course", short_name: "Camera Confidence", product_type: "course", program: null, default_price: null },
  { name: "Create Awesome Thumbnails", short_name: "Thumbnails", product_type: "course", program: null, default_price: null },
  { name: "Steal Our YouTube Playbook", short_name: "YT Playbook", product_type: "course", program: null, default_price: null },
  { name: "How to Make Awesome Videos", short_name: "Awesome Videos", product_type: "course", program: null, default_price: null },
  { name: "Video Editing Basics", short_name: "Editing Basics", product_type: "course", program: null, default_price: null },
];

// ---- Title Pattern Mappings ----
// Higher priority = checked first. Use higher priority for more specific patterns.
const MAPPINGS: MappingSeed[] = [
  // Coaching — high priority (most important to classify correctly)
  { product_name: "VRA Elite", title_pattern: "VRA Elite", match_type: "contains", priority: 100 },
  { product_name: "Think Media Accelerator", title_pattern: "Accelerator", match_type: "contains", priority: 90 },

  // VRA variants — medium-high priority
  { product_name: "VRA Bundle", title_pattern: "VRA Bundle", match_type: "contains", priority: 80 },
  { product_name: "VRA Accelerator Setup", title_pattern: "VRA Accelerator Setup", match_type: "contains", priority: 80 },
  { product_name: "VRA Base Lifetime", title_pattern: "VRA Base Lifetime", match_type: "contains", priority: 75 },
  { product_name: "VRA Membership - Annual", title_pattern: "VRA Membership - Annual", match_type: "contains", priority: 75 },
  { product_name: "VRA Membership - Monthly", title_pattern: "VRA Membership - Monthly", match_type: "contains", priority: 75 },
  { product_name: "Video Ranking Academy Course & Coaching Membership", title_pattern: "Video Ranking Academy Course & Coaching Membership", match_type: "contains", priority: 70 },
  { product_name: "Video Ranking Academy Course & Coaching Bundle", title_pattern: "Video Ranking Academy Course & Coaching Bundle", match_type: "contains", priority: 70 },
  { product_name: "Video Ranking Academy", title_pattern: "Video Ranking Academy", match_type: "contains", priority: 50 },

  // YouTube products
  { product_name: "YouTube Course & Coaching Bundle", title_pattern: "YouTube Course & Coaching Bundle", match_type: "contains", priority: 70 },
  { product_name: "YouTube Starter Kit", title_pattern: "YouTube Starter Kit", match_type: "contains", priority: 60 },
  { product_name: "YouTube Starter Kit", title_pattern: "Starter Kit OTO", match_type: "contains", priority: 60 },
  { product_name: "YouTube Starter Kit", title_pattern: "VIP OTO (Starter Kit", match_type: "contains", priority: 60 },
  { product_name: "YouTube Money Secrets", title_pattern: "YouTube Money Secrets", match_type: "contains", priority: 60 },
  { product_name: "YouTube Secrets", title_pattern: "YouTube Secrets", match_type: "contains", priority: 50 },

  // Events
  { product_name: "YouTube 1K Challenge", title_pattern: "YouTube 1K Challenge", match_type: "contains", priority: 60 },
  { product_name: "YouTube Growth Day", title_pattern: "YouTube Growth Day", match_type: "contains", priority: 60 },
  { product_name: "Holiday Bundle", title_pattern: "Holiday Bundle", match_type: "contains", priority: 55 },
  { product_name: "YouTube Growth Bundle", title_pattern: "YouTube Growth Bundle", match_type: "contains", priority: 55 },

  // Legacy / other
  { product_name: "Legacy Inner Circle Membership", title_pattern: "Legacy Inner Circle", match_type: "contains", priority: 50 },
  { product_name: "Video Success Secrets", title_pattern: "Video Success Secrets", match_type: "contains", priority: 50 },
  { product_name: "Camera Confidence Course", title_pattern: "Camera Confidence", match_type: "contains", priority: 40 },
  { product_name: "Create Awesome Thumbnails", title_pattern: "Create Awesome Thumbnails", match_type: "contains", priority: 40 },
  { product_name: "Steal Our YouTube Playbook", title_pattern: "Steal Our YouTube Playbook", match_type: "contains", priority: 40 },
  { product_name: "How to Make Awesome Videos", title_pattern: "How to Make Awesome Videos", match_type: "contains", priority: 40 },
  { product_name: "Video Editing Basics", title_pattern: "Video Editing Basics", match_type: "contains", priority: 40 },
];

async function main() {
  console.log("=== Seeding Products & Title Mappings ===\n");

  // Check if already seeded
  const { count } = await supabase.from("products").select("id", { count: "exact", head: true });
  if (count && count > 0) {
    console.log(`Products table already has ${count} records. Aborting to prevent duplicates.`);
    console.log("Clear the table first if you want to re-seed.");
    process.exit(0);
  }

  // Insert products
  console.log(`Inserting ${PRODUCTS.length} products...`);
  const { data: insertedProducts, error: prodError } = await supabase
    .from("products")
    .insert(PRODUCTS)
    .select("id, name");

  if (prodError) {
    console.error("Failed to insert products:", prodError.message);
    process.exit(1);
  }

  console.log(`  ✓ ${insertedProducts.length} products inserted`);

  // Build name → id map
  const productIdMap = new Map<string, string>();
  for (const p of insertedProducts) {
    productIdMap.set(p.name, p.id);
  }

  // Insert mappings
  console.log(`\nInserting ${MAPPINGS.length} title mappings...`);
  const mappingRows = MAPPINGS.map((m) => {
    const productId = productIdMap.get(m.product_name);
    if (!productId) {
      console.error(`  ⚠ No product found for "${m.product_name}"`);
      process.exit(1);
    }
    return {
      product_id: productId,
      title_pattern: m.title_pattern,
      match_type: m.match_type,
      priority: m.priority,
    };
  });

  const { error: mapError } = await supabase
    .from("product_title_mappings")
    .insert(mappingRows);

  if (mapError) {
    console.error("Failed to insert mappings:", mapError.message);
    process.exit(1);
  }

  console.log(`  ✓ ${mappingRows.length} title mappings inserted`);

  // Summary
  console.log("\n=== Summary ===");
  console.log(`Products:  ${insertedProducts.length}`);
  console.log(`Mappings:  ${mappingRows.length}`);
  console.log("\nCoaching programs:");
  for (const p of insertedProducts.filter((p: any) => PRODUCTS.find((s) => s.name === p.name)?.product_type === "coaching")) {
    console.log(`  • ${p.name}`);
  }
  console.log("\n✓ Done!");
}

main().catch(console.error);
