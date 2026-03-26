/**
 * Fix orphaned meetings — re-associate meetings that have no contact_id
 * by querying HubSpot for the meeting's associated contacts.
 *
 * Usage: npx tsx scripts/fix-orphaned-meetings.ts [--dry-run] [--limit=100]
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HUBSPOT_TOKEN = process.env.HUBSPOT_API_KEY!;
const RATE_LIMIT_MS = 110; // ~9 req/sec to stay under HubSpot 10/sec limit

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 500;
const monthArg = args.find((a) => a.startsWith("--month="));
const filterMonth = monthArg ? monthArg.split("=")[1] : null; // YYYY-MM

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`\n=== Fix Orphaned Meetings ===`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Limit: ${limit}`);
  console.log(`Month: ${filterMonth || "all"}\n`);

  // 1. Load contact map: hubspot_contact_id → supabase id
  console.log("Loading contact map from Supabase...");
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
  }
  console.log(`Loaded ${contactMap.size} contacts\n`);

  // 2. Fetch orphaned meetings
  let orphanQuery = supabase
    .from("meetings")
    .select("id, hubspot_meeting_id, title")
    .is("contact_id", null)
    .not("sales_rep_id", "is", null)
    .not("hubspot_meeting_id", "is", null)
    .order("meeting_date", { ascending: false })
    .limit(limit);

  if (filterMonth) {
    const [y, m] = filterMonth.split("-").map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    orphanQuery = orphanQuery
      .gte("meeting_date", `${filterMonth}-01T00:00:00Z`)
      .lt("meeting_date", `${nextMonth}-01T00:00:00Z`);
  }

  const { data: orphaned, error: orphanErr } = await orphanQuery;

  if (orphanErr) throw orphanErr;

  console.log(`Found ${orphaned?.length || 0} orphaned meetings to process\n`);

  let fixed = 0;
  let notFound = 0;
  let errors = 0;
  let created = 0;

  for (const meeting of orphaned || []) {
    try {
      // 3. Query HubSpot for meeting's associated contacts
      const res = await fetch(
        `https://api.hubapi.com/crm/v3/objects/meetings/${meeting.hubspot_meeting_id}/associations/contacts`,
        {
          headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
        }
      );

      if (!res.ok) {
        if (res.status === 404) {
          notFound++;
          continue;
        }
        console.error(`  HubSpot error for meeting ${meeting.hubspot_meeting_id}: ${res.status}`);
        errors++;
        continue;
      }

      const data = await res.json();
      const associations = data.results || [];

      if (associations.length === 0) {
        notFound++;
        continue;
      }

      // Take the first associated contact
      const hsContactId = associations[0].id?.toString();
      if (!hsContactId) {
        notFound++;
        continue;
      }

      // Look up in our contact map
      let supabaseContactId = contactMap.get(hsContactId);

      if (!supabaseContactId) {
        // Contact exists in HubSpot but not in our contacts table — fetch and create
        await sleep(RATE_LIMIT_MS);
        const contactRes = await fetch(
          `https://api.hubapi.com/crm/v3/objects/contacts/${hsContactId}?properties=email,firstname,lastname,phone`,
          { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
        );

        if (!contactRes.ok) {
          notFound++;
          continue;
        }

        const contactData = await contactRes.json();
        const email = contactData.properties?.email;
        if (!email) {
          notFound++;
          continue;
        }

        // Check if contact already exists by email (may have different HS ID)
        const { data: existingByEmail } = await supabase
          .from("contacts")
          .select("id")
          .eq("email", email.toLowerCase())
          .maybeSingle();

        if (existingByEmail) {
          supabaseContactId = existingByEmail.id;
        } else if (!dryRun) {
          // Create the contact
          const firstName = contactData.properties?.firstname || "";
          const lastName = contactData.properties?.lastname || "";
          const fullName = `${firstName} ${lastName}`.trim() || email;

          const { data: newContact, error: createErr } = await supabase
            .from("contacts")
            .insert({
              hubspot_contact_id: hsContactId,
              email: email.toLowerCase(),
              first_name: firstName,
              last_name: lastName,
              phone: contactData.properties?.phone || "",
              lifecycle_stage: "customer",
              metadata: {},
            })
            .select("id")
            .single();

          if (createErr) {
            console.error(`  Failed to create contact for ${email}: ${createErr.message}`);
            errors++;
            continue;
          }
          supabaseContactId = newContact.id;
          contactMap.set(hsContactId, supabaseContactId);
          created++;
        } else {
          // Dry run — count as would-be-fixed
          supabaseContactId = "dry-run-placeholder";
          created++;
        }
      }

      // 4. Update the meeting
      if (!dryRun) {
        const { error: updateErr } = await supabase
          .from("meetings")
          .update({ contact_id: supabaseContactId })
          .eq("id", meeting.id);

        if (updateErr) {
          console.error(`  Failed to update meeting ${meeting.id}: ${updateErr.message}`);
          errors++;
          continue;
        }
      }

      fixed++;
      if (fixed % 50 === 0) {
        console.log(`  ...fixed ${fixed} so far`);
      }

      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.error(`  Error processing meeting ${meeting.id}:`, err);
      errors++;
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Fixed:     ${fixed}`);
  console.log(`Created:   ${created} (new contacts added to MC)`);
  console.log(`Not found: ${notFound} (no HubSpot association or no email)`);
  console.log(`Errors:    ${errors}`);
  console.log(`Total:     ${orphaned?.length || 0}`);

  if (dryRun) {
    console.log(`\n(Dry run — no changes made. Remove --dry-run to apply.)`);
  }
}

main().catch(console.error);
