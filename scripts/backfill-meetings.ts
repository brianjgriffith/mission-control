/**
 * Historical backfill: HubSpot Meetings → Supabase
 * Run with: npx tsx scripts/backfill-meetings.ts
 *
 * Strategy:
 *   1. Load sales_reps from Supabase (keyed by email)
 *   2. Load HubSpot owners to map owner_id → email
 *   3. Paginate through all HubSpot meetings (with contact associations)
 *   4. Map owner → sales_rep, associated contact → contact_id
 *   5. Upsert meetings into Supabase
 *
 * HubSpot API limits: 100 records/page, 10 requests/second (private app)
 * Total meetings: ~12,617 — should complete in ~3 minutes.
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

// ---- Step 1: Load sales reps from Supabase ----

async function loadSalesReps(): Promise<Map<string, string>> {
  console.log("--- Loading sales reps from Supabase ---");

  const { data, error } = await supabase
    .from("sales_reps")
    .select("id, name, email");

  if (error) throw new Error(`Failed to load sales reps: ${error.message}`);

  const emailToRepId = new Map<string, string>();
  for (const rep of data || []) {
    if (rep.email) {
      emailToRepId.set(rep.email.toLowerCase(), rep.id);
    }
    console.log(`  • ${rep.name} (${rep.email || "no email"}) — ${rep.id}`);
  }

  console.log(`  ✓ ${emailToRepId.size} sales reps loaded\n`);
  return emailToRepId;
}

// ---- Step 2: Load HubSpot owners to map owner_id → email ----

async function loadHubSpotOwners(): Promise<Map<string, string>> {
  console.log("--- Loading HubSpot owners ---");

  const data = await hubspotGet(
    "https://api.hubapi.com/crm/v3/owners?limit=100"
  );

  const ownerToEmail = new Map<string, string>();
  for (const owner of data.results || []) {
    if (owner.email) {
      ownerToEmail.set(owner.id, owner.email.toLowerCase());
    }
  }

  console.log(`  ✓ ${ownerToEmail.size} owners loaded\n`);
  return ownerToEmail;
}

// ---- Step 3: Load contact hubspot_id → Supabase id map ----

async function loadContactMap(): Promise<Map<string, string>> {
  console.log("--- Loading contacts from Supabase (hubspot_contact_id → id) ---");

  // Fetch in batches since there are 64K+ contacts
  const contactMap = new Map<string, string>();
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, hubspot_contact_id")
      .not("hubspot_contact_id", "is", null)
      .range(offset, offset + batchSize - 1);

    if (error) throw new Error(`Failed to load contacts: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const c of data) {
      if (c.hubspot_contact_id) {
        contactMap.set(c.hubspot_contact_id, c.id);
      }
    }

    offset += batchSize;
    if (data.length < batchSize) break;
  }

  console.log(`  ✓ ${contactMap.size} contacts loaded\n`);
  return contactMap;
}

// ---- Step 4: Fetch all meetings from HubSpot ----

interface MeetingRow {
  hubspot_meeting_id: string;
  sales_rep_id: string | null;
  contact_id: string | null;
  title: string;
  meeting_date: string;
  duration_minutes: number | null;
  booking_source: string;
  outcome: "pending";
  metadata: Record<string, any>;
}

async function fetchAllMeetings(
  emailToRepId: Map<string, string>,
  ownerToEmail: Map<string, string>,
  contactMap: Map<string, string>,
  startAfter?: string
): Promise<MeetingRow[]> {
  console.log("--- Fetching meetings from HubSpot ---");

  const meetings: MeetingRow[] = [];
  let after = startAfter || undefined;
  let page = 0;
  let skippedNoDate = 0;
  let matchedRep = 0;
  let unmatchedRep = 0;
  let matchedContact = 0;
  let unmatchedContact = 0;

  const properties = [
    "hs_meeting_title",
    "hs_meeting_start_time",
    "hs_meeting_end_time",
    "hs_meeting_outcome",
    "hubspot_owner_id",
    "hs_meeting_source",
    "hs_activity_type",
  ].join(",");

  while (true) {
    const url = `https://api.hubapi.com/crm/v3/objects/meetings?limit=${BATCH_SIZE}&properties=${properties}&associations=contacts${after ? `&after=${after}` : ""}`;

    const data = await hubspotGet(url);
    const results = data.results || [];

    for (const r of results) {
      const props = r.properties || {};

      // Must have a start time
      const startTime = props.hs_meeting_start_time;
      if (!startTime) {
        skippedNoDate++;
        continue;
      }

      // Map owner → sales rep
      let salesRepId: string | null = null;
      const ownerId = props.hubspot_owner_id;
      if (ownerId) {
        const ownerEmail = ownerToEmail.get(ownerId);
        if (ownerEmail) {
          salesRepId = emailToRepId.get(ownerEmail) || null;
        }
      }
      if (salesRepId) matchedRep++;
      else unmatchedRep++;

      // Map first associated contact
      let contactId: string | null = null;
      const contactAssoc = r.associations?.contacts?.results?.[0];
      if (contactAssoc?.id) {
        contactId = contactMap.get(contactAssoc.id) || null;
      }
      if (contactId) matchedContact++;
      else unmatchedContact++;

      // Calculate duration
      let durationMinutes: number | null = null;
      const endTime = props.hs_meeting_end_time;
      if (startTime && endTime) {
        const diffMs = new Date(endTime).getTime() - new Date(startTime).getTime();
        if (diffMs > 0) {
          durationMinutes = Math.round(diffMs / 60000);
        }
      }

      meetings.push({
        hubspot_meeting_id: r.id,
        sales_rep_id: salesRepId,
        contact_id: contactId,
        title: props.hs_meeting_title || "",
        meeting_date: startTime,
        duration_minutes: durationMinutes,
        booking_source: props.hs_meeting_source || "",
        outcome: "pending",
        metadata: {
          hubspot_owner_id: ownerId || null,
          hs_meeting_outcome: props.hs_meeting_outcome || null,
          hs_activity_type: props.hs_activity_type || null,
          hs_meeting_source: props.hs_meeting_source || null,
          associated_contact_hubspot_id: contactAssoc?.id || null,
        },
      });
    }

    page++;
    if (page % 25 === 0) {
      console.log(`  Fetched ${meetings.length} meetings (page ${page}, cursor: ${after})...`);
    }

    after = data.paging?.next?.after;
    if (!after) break;

    await sleep(RATE_LIMIT_MS);
  }

  console.log(`  ✓ Total meetings fetched: ${meetings.length}`);
  console.log(`  Skipped (no date): ${skippedNoDate}`);
  console.log(`  Matched to sales rep: ${matchedRep}, unmatched: ${unmatchedRep}`);
  console.log(`  Matched to contact: ${matchedContact}, unmatched: ${unmatchedContact}\n`);
  return meetings;
}

// ---- Step 5: Upsert meetings into Supabase ----

async function upsertMeetings(meetings: MeetingRow[]) {
  console.log(`--- Upserting ${meetings.length} meetings to Supabase ---`);

  let inserted = 0;

  for (let i = 0; i < meetings.length; i += SUPABASE_BATCH) {
    const batch = meetings.slice(i, i + SUPABASE_BATCH);

    const { error } = await supabase
      .from("meetings")
      .upsert(batch, { onConflict: "hubspot_meeting_id" });

    if (error) {
      console.error(`  Error upserting meetings (batch at ${i}):`, error.message);
      // Try smaller batches
      for (let j = 0; j < batch.length; j += 50) {
        const smallBatch = batch.slice(j, j + 50);
        const { error: smallErr } = await supabase
          .from("meetings")
          .upsert(smallBatch, { onConflict: "hubspot_meeting_id" });
        if (smallErr) {
          console.error(`  Small batch error at ${i + j}: ${smallErr.message}`);
        } else {
          inserted += smallBatch.length;
        }
      }
      continue;
    }

    inserted += batch.length;

    if ((i / SUPABASE_BATCH) % 5 === 0 && i > 0) {
      console.log(`  Upserted ${inserted} meetings...`);
    }
  }

  console.log(`  ✓ Meetings upserted: ${inserted}`);
}

// ---- Main ----

async function main() {
  console.log("=== HubSpot Meetings → Supabase Backfill ===");
  console.log(`Started: ${new Date().toISOString()}\n`);

  // Parse --after flag for resume
  const afterArg = process.argv.find((a) => a.startsWith("--after="));
  const startAfter = afterArg?.split("=")[1];
  if (startAfter) {
    console.log(`Resuming from cursor: ${startAfter}\n`);
  }

  // Step 1: Load sales reps
  const emailToRepId = await loadSalesReps();

  // Step 2: Load HubSpot owners
  const ownerToEmail = await loadHubSpotOwners();

  // Step 3: Load contacts
  const contactMap = await loadContactMap();

  // Step 4: Fetch all meetings
  const meetings = await fetchAllMeetings(emailToRepId, ownerToEmail, contactMap, startAfter);

  // Step 5: Upsert to Supabase
  await upsertMeetings(meetings);

  console.log(`\n=== Backfill complete! ===`);
  console.log(`Finished: ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error("\n✗ Backfill failed:", err);
  process.exit(1);
});
