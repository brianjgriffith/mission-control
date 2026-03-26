/**
 * Incremental meeting sync: fetches HubSpot meetings modified in the last N days.
 * Run with: npx tsx scripts/sync-recent-meetings.ts [--days=7]
 *
 * Uses the HubSpot search API with a lastmodifieddate filter.
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
  if (!res.ok) throw new Error(`HubSpot GET ${url}: ${res.status} ${res.statusText}`);
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
  if (!res.ok) throw new Error(`HubSpot POST ${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function main() {
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const days = daysArg ? parseInt(daysArg.split("=")[1], 10) : 7;
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

  console.log(`\n=== Sync Recent Meetings (last ${days} days) ===\n`);

  // 1. Load owner → email map
  console.log("Loading HubSpot owners...");
  const ownersData = await hubspotGet("https://api.hubapi.com/crm/v3/owners?limit=200");
  const ownerToEmail = new Map<string, string>();
  for (const o of ownersData.results || []) {
    if (o.email) ownerToEmail.set(o.id, o.email.toLowerCase());
  }
  console.log(`  ${ownerToEmail.size} owners loaded`);

  // 2. Load sales rep email → ID
  const { data: reps } = await supabase.from("sales_reps").select("id, email").eq("is_active", true);
  const emailToRepId = new Map<string, string>();
  for (const r of reps || []) {
    if (r.email) emailToRepId.set(r.email.toLowerCase(), r.id);
  }
  console.log(`  ${emailToRepId.size} sales reps loaded`);

  // 3. Load contact map
  console.log("Loading contacts...");
  const contactMap = new Map<string, string>();
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("contacts")
      .select("id, hubspot_contact_id")
      .not("hubspot_contact_id", "is", null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const c of data) {
      if (c.hubspot_contact_id) contactMap.set(c.hubspot_contact_id, c.id);
    }
    offset += 1000;
  }
  console.log(`  ${contactMap.size} contacts loaded`);

  // 4. Search HubSpot meetings modified recently
  console.log(`\nFetching meetings modified since ${new Date(sinceMs).toISOString().slice(0, 10)}...`);

  const properties = [
    "hs_meeting_title", "hs_meeting_start_time", "hs_meeting_end_time",
    "hs_meeting_outcome", "hubspot_owner_id", "hs_meeting_source",
  ].join(",");

  let after: string | undefined;
  let totalFetched = 0;
  let upserted = 0;
  let skippedNoRep = 0;

  const toUpsert: any[] = [];

  while (true) {
    const searchBody: any = {
      filterGroups: [{
        filters: [{
          propertyName: "hs_lastmodifieddate",
          operator: "GTE",
          value: String(sinceMs),
        }],
      }],
      properties: properties.split(","),
      limit: 100,
    };
    if (after) searchBody.after = after;

    const data = await hubspotPost("https://api.hubapi.com/crm/v3/objects/meetings/search", searchBody);
    const results = data.results || [];
    totalFetched += results.length;

    for (const mtg of results) {
      const ownerId = mtg.properties?.hubspot_owner_id;
      const ownerEmail = ownerId ? ownerToEmail.get(ownerId) : null;
      const repId = ownerEmail ? emailToRepId.get(ownerEmail) : null;

      if (!repId) {
        skippedNoRep++;
        continue;
      }

      const startTime = mtg.properties?.hs_meeting_start_time;
      const endTime = mtg.properties?.hs_meeting_end_time;
      const duration = startTime && endTime
        ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)
        : 0;

      toUpsert.push({
        hubspot_meeting_id: mtg.id,
        title: mtg.properties?.hs_meeting_title || "",
        meeting_date: startTime || "",
        duration_minutes: duration,
        sales_rep_id: repId,
        booking_source: mtg.properties?.hs_meeting_source || "",
      });
    }

    console.log(`  Fetched ${totalFetched} meetings...`);

    after = data.paging?.next?.after;
    if (!after || results.length === 0) break;
    await sleep(RATE_LIMIT_MS);
  }

  console.log(`\nTotal fetched: ${totalFetched}`);
  console.log(`With sales rep: ${toUpsert.length}`);
  console.log(`Skipped (no rep): ${skippedNoRep}`);

  // 5. Now get contact associations for meetings we're upserting
  console.log("\nFetching contact associations...");
  for (const mtg of toUpsert) {
    try {
      const assocData = await hubspotGet(
        `https://api.hubapi.com/crm/v3/objects/meetings/${mtg.hubspot_meeting_id}/associations/contacts`
      );
      const associations = assocData.results || [];
      if (associations.length > 0) {
        const hsContactId = associations[0].id?.toString();
        mtg.contact_id = contactMap.get(hsContactId) || null;
      }
      await sleep(RATE_LIMIT_MS);
    } catch {
      // Skip association errors
    }
  }

  const withContact = toUpsert.filter((m) => m.contact_id).length;
  console.log(`  ${withContact}/${toUpsert.length} matched to contacts`);

  // 6. Upsert to Supabase in batches
  console.log("\nUpserting to Supabase...");
  const batchSize = 100;
  for (let i = 0; i < toUpsert.length; i += batchSize) {
    const batch = toUpsert.slice(i, i + batchSize);
    const { error } = await supabase
      .from("meetings")
      .upsert(batch, { onConflict: "hubspot_meeting_id" });

    if (error) {
      console.error(`  Batch error:`, error.message);
    } else {
      upserted += batch.length;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Upserted: ${upserted} meetings`);
}

main().catch(console.error);
