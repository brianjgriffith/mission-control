/**
 * Historical backfill: HubSpot Contacts + Charges → Supabase
 * Run with: npx tsx scripts/backfill-hubspot.ts
 *
 * Strategy:
 *   1. Pull all charges from HubSpot (with contact associations)
 *   2. Collect unique contact IDs from charges
 *   3. Pull those contacts from HubSpot
 *   4. Upsert contacts into Supabase
 *   5. Match charges to products via title mappings
 *   6. Upsert charges into Supabase linked to contacts
 *
 * HubSpot API limits: 100 records/page, 10 requests/second (private app)
 * Total charges: ~238K — this script will take a while.
 *
 * Supports resuming: pass --after=<cursor> to resume from a specific page.
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

const CHARGE_OBJECT_ID = "2-43876992";
const BATCH_SIZE = 100; // HubSpot max per page
const SUPABASE_BATCH = 500;
const RATE_LIMIT_MS = 120; // ~8 req/s to stay under 10/s limit

// ---- Helpers ----

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

async function hubspotPost(url: string, body: any): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") || "10", 10);
    console.log(`  Rate limited, waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return hubspotPost(url, body);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API ${res.status}: ${text}`);
  }
  return res.json();
}

// ---- Product matching ----

interface TitleMapping {
  product_id: string;
  title_pattern: string;
  match_type: string;
  priority: number;
}

let titleMappings: TitleMapping[] = [];

async function loadTitleMappings() {
  const { data, error } = await supabase
    .from("product_title_mappings")
    .select("product_id, title_pattern, match_type, priority")
    .order("priority", { ascending: false });

  if (error) throw new Error(`Failed to load title mappings: ${error.message}`);
  titleMappings = data || [];
  console.log(`Loaded ${titleMappings.length} title mappings`);
}

function matchProduct(chargeTitle: string, productName: string): string | null {
  // First try the structured product_name field (more reliable)
  for (const m of titleMappings) {
    const target = productName || chargeTitle;
    if (m.match_type === "contains" && target.includes(m.title_pattern)) {
      return m.product_id;
    }
    if (m.match_type === "starts_with" && target.startsWith(m.title_pattern)) {
      return m.product_id;
    }
  }
  // Fallback: try against the full charge title
  if (productName) {
    for (const m of titleMappings) {
      if (m.match_type === "contains" && chargeTitle.includes(m.title_pattern)) {
        return m.product_id;
      }
    }
  }
  return null;
}

// ---- Step 1: Pull all charges ----

interface HubSpotCharge {
  hubspot_id: string;
  charge_name: string;
  product_name: string;
  amount: number;
  contact_email: string;
  contact_hubspot_id: string | null;
  payment_date: string | null;
  payment_type: string;
  payment_status: string;
  processor: string;
  is_subscription: boolean;
  created_at: string;
}

async function fetchAllCharges(startAfter?: string): Promise<HubSpotCharge[]> {
  console.log("\n--- Step 1: Fetching charges from HubSpot ---");

  const charges: HubSpotCharge[] = [];
  let after = startAfter || undefined;
  let page = 0;
  const properties = "charge_name,amount,contact_email,product_name,payment_type,payment_status,payment_date,processor,subscription_,hs_createdate";

  while (true) {
    const url = `https://api.hubapi.com/crm/v3/objects/${CHARGE_OBJECT_ID}?limit=${BATCH_SIZE}&properties=${properties}&associations=contacts${after ? `&after=${after}` : ""}`;

    const data = await hubspotGet(url);
    const results = data.results || [];

    for (const r of results) {
      const props = r.properties || {};
      const contactAssoc = r.associations?.contacts?.results?.[0];

      charges.push({
        hubspot_id: r.id,
        charge_name: props.charge_name || "",
        product_name: props.product_name || "",
        amount: parseFloat(props.amount || "0"),
        contact_email: props.contact_email || "",
        contact_hubspot_id: contactAssoc?.id || null,
        payment_date: props.payment_date || null,
        payment_type: props.payment_type || "",
        payment_status: props.payment_status || "",
        processor: props.processor || "",
        is_subscription: props.subscription_ === "Yes",
        created_at: props.hs_createdate || new Date().toISOString(),
      });
    }

    page++;
    if (page % 50 === 0) {
      console.log(`  Fetched ${charges.length} charges (page ${page})...`);
    }

    after = data.paging?.next?.after;
    if (!after) break;

    await sleep(RATE_LIMIT_MS);
  }

  console.log(`  ✓ Total charges fetched: ${charges.length}`);
  return charges;
}

// ---- Step 2: Collect unique contacts and fetch them ----

async function fetchContacts(contactIds: string[]): Promise<Map<string, any>> {
  console.log(`\n--- Step 2: Fetching ${contactIds.length} contacts from HubSpot ---`);

  const contactMap = new Map<string, any>();
  const properties = "email,firstname,lastname,phone,lifecyclestage,first_conversion_date,recent_conversion_date,hubspot_owner_id";

  // Batch fetch contacts (max 100 per request via /batch/read)
  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);

    const data = await hubspotPost(
      "https://api.hubapi.com/crm/v3/objects/contacts/batch/read",
      {
        inputs: batch.map((id) => ({ id })),
        properties: properties.split(","),
      }
    );

    for (const r of data.results || []) {
      contactMap.set(r.id, {
        hubspot_contact_id: r.id,
        email: r.properties.email || "",
        first_name: r.properties.firstname || "",
        last_name: r.properties.lastname || "",
        phone: r.properties.phone || "",
        lifecycle_stage: r.properties.lifecyclestage || "",
        first_conversion_date: r.properties.first_conversion_date || null,
        recent_conversion_date: r.properties.recent_conversion_date || null,
        hubspot_owner_id: r.properties.hubspot_owner_id || null,
      });
    }

    if ((i / BATCH_SIZE) % 20 === 0 && i > 0) {
      console.log(`  Fetched ${contactMap.size} contacts...`);
    }

    await sleep(RATE_LIMIT_MS);
  }

  console.log(`  ✓ Total contacts fetched: ${contactMap.size}`);
  return contactMap;
}

// ---- Step 3: Upsert contacts into Supabase ----

async function upsertContacts(contactMap: Map<string, any>): Promise<Map<string, string>> {
  console.log(`\n--- Step 3: Upserting ${contactMap.size} contacts to Supabase ---`);

  const hubspotToSupabaseId = new Map<string, string>();
  const contacts = Array.from(contactMap.values());

  for (let i = 0; i < contacts.length; i += SUPABASE_BATCH) {
    const batch = contacts.slice(i, i + SUPABASE_BATCH);

    const { data, error } = await supabase
      .from("contacts")
      .upsert(batch, { onConflict: "hubspot_contact_id" })
      .select("id, hubspot_contact_id");

    if (error) {
      console.error(`  Error upserting contacts (batch ${i}):`, error.message);
      // Try one by one to find the problem record
      for (const c of batch) {
        const { data: single, error: singleErr } = await supabase
          .from("contacts")
          .upsert(c, { onConflict: "hubspot_contact_id" })
          .select("id, hubspot_contact_id")
          .single();
        if (singleErr) {
          console.error(`  Failed contact: ${c.email} — ${singleErr.message}`);
        } else if (single) {
          hubspotToSupabaseId.set(single.hubspot_contact_id, single.id);
        }
      }
      continue;
    }

    if (data) {
      for (const row of data) {
        hubspotToSupabaseId.set(row.hubspot_contact_id, row.id);
      }
    }

    if ((i / SUPABASE_BATCH) % 10 === 0 && i > 0) {
      console.log(`  Upserted ${hubspotToSupabaseId.size} contacts...`);
    }
  }

  console.log(`  ✓ Contacts in Supabase: ${hubspotToSupabaseId.size}`);
  return hubspotToSupabaseId;
}

// ---- Step 4: Upsert charges into Supabase ----

async function upsertCharges(
  charges: HubSpotCharge[],
  contactIdMap: Map<string, string>
) {
  console.log(`\n--- Step 4: Upserting ${charges.length} charges to Supabase ---`);

  let inserted = 0;
  let skippedNoContact = 0;
  let matchedProduct = 0;
  let unmatchedProduct = 0;
  const unmatchedTitles = new Map<string, number>();

  const rows = [];

  for (const c of charges) {
    // Find the Supabase contact ID
    let contactId: string | null = null;
    if (c.contact_hubspot_id) {
      contactId = contactIdMap.get(c.contact_hubspot_id) || null;
    }
    // Fallback: look up by email
    if (!contactId && c.contact_email) {
      const { data } = await supabase
        .from("contacts")
        .select("id")
        .eq("email", c.contact_email)
        .limit(1)
        .maybeSingle();
      if (data) contactId = data.id;
    }

    if (!contactId) {
      // Create a minimal contact from the charge email
      if (c.contact_email) {
        const { data: newContact } = await supabase
          .from("contacts")
          .upsert(
            {
              hubspot_contact_id: c.contact_hubspot_id || `email-${c.contact_email}`,
              email: c.contact_email,
            },
            { onConflict: "hubspot_contact_id" }
          )
          .select("id")
          .single();
        if (newContact) {
          contactId = newContact.id;
          if (c.contact_hubspot_id) {
            contactIdMap.set(c.contact_hubspot_id, newContact.id);
          }
        }
      }
      if (!contactId) {
        skippedNoContact++;
        continue;
      }
    }

    // Match to a product
    const productId = matchProduct(c.charge_name, c.product_name);
    if (productId) {
      matchedProduct++;
    } else {
      unmatchedProduct++;
      const key = c.product_name || c.charge_name.split(" - ").slice(0, 2).join(" - ");
      unmatchedTitles.set(key, (unmatchedTitles.get(key) || 0) + 1);
    }

    // Determine payment plan type
    let paymentPlanType: string | null = null;
    if (c.payment_type === "subscription") paymentPlanType = "subscription";
    else if (c.payment_type === "multipay") paymentPlanType = "installment";
    else if (c.payment_type === "onetime" || c.payment_type === "one_time") paymentPlanType = "one_time";
    else if (c.payment_type) paymentPlanType = c.payment_type;

    rows.push({
      contact_id: contactId,
      hubspot_charge_id: c.hubspot_id,
      product_id: productId,
      raw_title: c.charge_name,
      product_variant: c.product_name || "",
      amount: c.amount,
      source_platform: c.processor?.toLowerCase().includes("samcart")
        ? "samcart"
        : c.processor?.toLowerCase().includes("kajabi")
          ? "kajabi"
          : "hubspot",
      payment_plan_type: paymentPlanType,
      subscription_status: c.is_subscription
        ? (c.payment_status === "Successful" ? "active" : c.payment_status?.toLowerCase() || null)
        : null,
      charge_date: c.payment_date
        ? new Date(c.payment_date).toISOString()
        : c.created_at,
    });
  }

  // Batch upsert into Supabase
  for (let i = 0; i < rows.length; i += SUPABASE_BATCH) {
    const batch = rows.slice(i, i + SUPABASE_BATCH);

    const { error } = await supabase
      .from("charges")
      .upsert(batch, { onConflict: "hubspot_charge_id" });

    if (error) {
      console.error(`  Error upserting charges (batch ${i}):`, error.message);
      // Try smaller batches
      for (let j = 0; j < batch.length; j += 50) {
        const smallBatch = batch.slice(j, j + 50);
        const { error: smallErr } = await supabase
          .from("charges")
          .upsert(smallBatch, { onConflict: "hubspot_charge_id" });
        if (smallErr) {
          console.error(`  Small batch error at ${i + j}: ${smallErr.message}`);
        } else {
          inserted += smallBatch.length;
        }
      }
      continue;
    }

    inserted += batch.length;

    if ((i / SUPABASE_BATCH) % 10 === 0 && i > 0) {
      console.log(`  Upserted ${inserted} charges...`);
    }
  }

  console.log(`  ✓ Charges upserted: ${inserted}`);
  console.log(`  Product matched: ${matchedProduct}`);
  console.log(`  Product unmatched: ${unmatchedProduct}`);
  console.log(`  Skipped (no contact): ${skippedNoContact}`);

  if (unmatchedTitles.size > 0) {
    console.log(`\n  Top unmatched product names:`);
    const sorted = Array.from(unmatchedTitles.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    for (const [title, count] of sorted) {
      console.log(`    ${count.toString().padStart(5)} × ${title}`);
    }
  }
}

// ---- Main ----

async function main() {
  console.log("=== HubSpot → Supabase Historical Backfill ===");
  console.log(`Started: ${new Date().toISOString()}\n`);

  // Parse --after flag for resume
  const afterArg = process.argv.find((a) => a.startsWith("--after="));
  const startAfter = afterArg?.split("=")[1];
  if (startAfter) {
    console.log(`Resuming from cursor: ${startAfter}`);
  }

  await loadTitleMappings();

  // Step 1: Fetch all charges
  const charges = await fetchAllCharges(startAfter);

  // Step 2: Collect unique contact IDs and fetch them
  const uniqueContactIds = [
    ...new Set(charges.map((c) => c.contact_hubspot_id).filter(Boolean)),
  ] as string[];
  console.log(`\nUnique contacts referenced by charges: ${uniqueContactIds.length}`);

  const contactMap = await fetchContacts(uniqueContactIds);

  // Step 3: Upsert contacts
  const contactIdMap = await upsertContacts(contactMap);

  // Step 4: Upsert charges
  await upsertCharges(charges, contactIdMap);

  console.log(`\n=== Backfill complete! ===`);
  console.log(`Finished: ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error("\n✗ Backfill failed:", err);
  process.exit(1);
});
