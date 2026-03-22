/**
 * Backfill HubSpot Commerce Payments → Supabase
 * Run with: npx tsx scripts/backfill-hubspot-payments.ts
 *
 * These are direct HubSpot payment link purchases (~1,339 records),
 * separate from the Charges custom object we already synced.
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
    console.log(`  Rate limited, waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return hubspotGet(url);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API ${res.status}: ${text}`);
  }
  return res.json();
}

// Load product title mappings for matching
interface TitleMapping {
  product_id: string;
  title_pattern: string;
  priority: number;
}

let titleMappings: TitleMapping[] = [];

async function loadTitleMappings() {
  const { data } = await supabase
    .from("product_title_mappings")
    .select("product_id, title_pattern, priority")
    .order("priority", { ascending: false });
  titleMappings = data || [];
  console.log(`Loaded ${titleMappings.length} title mappings`);
}

function matchProduct(sourceName: string): string | null {
  for (const m of titleMappings) {
    if (sourceName.includes(m.title_pattern)) {
      return m.product_id;
    }
  }
  return null;
}

async function main() {
  console.log("=== HubSpot Commerce Payments → Supabase Backfill ===\n");

  await loadTitleMappings();

  // Load contacts for lookup
  console.log("Loading contacts from Supabase...");
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, email, hubspot_contact_id");
  const emailToContactId = new Map<string, string>();
  const hsIdToContactId = new Map<string, string>();
  for (const c of contacts || []) {
    if (c.email) emailToContactId.set(c.email.toLowerCase(), c.id);
    hsIdToContactId.set(c.hubspot_contact_id, c.id);
  }
  console.log(`  ${emailToContactId.size} contacts loaded\n`);

  // Fetch all commerce payments
  console.log("Fetching commerce payments from HubSpot...");
  const properties = "hs_initial_amount,hs_net_amount,hs_latest_status,hs_customer_email,hs_payment_source_name,hs_payment_method_type,hs_refunds_amount,hs_createdate";

  interface Payment {
    hubspot_id: string;
    amount: number;
    net_amount: number;
    status: string;
    email: string;
    source_name: string;
    payment_method: string;
    refund_amount: number;
    created_at: string;
    contact_hubspot_id: string | null;
  }

  const payments: Payment[] = [];
  let after: string | undefined;

  while (true) {
    const url = `https://api.hubapi.com/crm/v3/objects/commerce_payments?limit=100&properties=${properties}&associations=contacts${after ? `&after=${after}` : ""}`;
    const data = await hubspotGet(url);

    for (const r of data.results || []) {
      const props = r.properties || {};
      const contactAssoc = r.associations?.contacts?.results?.[0];

      payments.push({
        hubspot_id: `hspay-${r.id}`, // prefix to avoid collision with charge IDs
        amount: parseFloat(props.hs_initial_amount || "0"),
        net_amount: parseFloat(props.hs_net_amount || "0"),
        status: props.hs_latest_status || "",
        email: props.hs_customer_email || "",
        source_name: props.hs_payment_source_name || "",
        payment_method: props.hs_payment_method_type || "",
        refund_amount: parseFloat(props.hs_refunds_amount || "0"),
        created_at: props.hs_createdate || new Date().toISOString(),
        contact_hubspot_id: contactAssoc?.id || null,
      });
    }

    after = data.paging?.next?.after;
    if (!after) break;
    await sleep(RATE_LIMIT_MS);
  }

  console.log(`  ✓ Fetched ${payments.length} commerce payments\n`);

  // Build charge rows
  let matched = 0;
  let unmatched = 0;
  let contactsFound = 0;
  let contactsCreated = 0;

  const rows: any[] = [];

  for (const p of payments) {
    // Skip failed payments
    if (p.status === "failed") continue;

    // Find contact
    let contactId: string | null = null;

    // Try by HubSpot contact association
    if (p.contact_hubspot_id) {
      contactId = hsIdToContactId.get(p.contact_hubspot_id) || null;
    }

    // Fallback: by email
    if (!contactId && p.email) {
      contactId = emailToContactId.get(p.email.toLowerCase()) || null;
    }

    // Create contact if needed
    if (!contactId && p.email) {
      const { data: newContact } = await supabase
        .from("contacts")
        .upsert(
          {
            hubspot_contact_id: p.contact_hubspot_id || `hspay-email-${p.email}`,
            email: p.email,
          },
          { onConflict: "hubspot_contact_id" }
        )
        .select("id")
        .single();

      if (newContact) {
        contactId = newContact.id;
        emailToContactId.set(p.email.toLowerCase(), newContact.id);
        contactsCreated++;
      }
    }

    if (contactId) contactsFound++;

    // Match product
    const productId = matchProduct(p.source_name);
    if (productId) matched++;
    else unmatched++;

    rows.push({
      contact_id: contactId,
      hubspot_charge_id: p.hubspot_id,
      product_id: productId,
      raw_title: p.source_name + " - " + p.email + " - $" + p.amount,
      product_variant: p.source_name,
      amount: p.amount,
      source_platform: "hubspot_payments",
      payment_plan_type: "subscription", // HubSpot payments are recurring
      subscription_status: p.status === "succeeded" ? "active" : p.status,
      refund_amount: p.refund_amount > 0 ? p.refund_amount : null,
      charge_date: p.created_at,
    });
  }

  console.log(`Rows to upsert: ${rows.length}`);
  console.log(`  Contacts found: ${contactsFound}, created: ${contactsCreated}`);
  console.log(`  Products matched: ${matched}, unmatched: ${unmatched}\n`);

  // Batch upsert
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase
      .from("charges")
      .upsert(batch, { onConflict: "hubspot_charge_id" });

    if (error) {
      console.error(`  Error at batch ${i}:`, error.message);
      // Try smaller batches
      for (let j = 0; j < batch.length; j += 50) {
        const small = batch.slice(j, j + 50);
        const { error: smallErr } = await supabase
          .from("charges")
          .upsert(small, { onConflict: "hubspot_charge_id" });
        if (smallErr) {
          console.error(`  Small batch error at ${i + j}: ${smallErr.message}`);
        } else {
          inserted += small.length;
        }
      }
      continue;
    }
    inserted += batch.length;
  }

  console.log(`\n✓ Upserted ${inserted} commerce payments to Supabase`);
  console.log(`  Source platform: hubspot_payments`);
  console.log("\n=== Done! ===");
}

main().catch((err) => {
  console.error("\n✗ Backfill failed:", err);
  process.exit(1);
});
