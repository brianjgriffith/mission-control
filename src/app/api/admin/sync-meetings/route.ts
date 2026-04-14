import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/admin/sync-meetings
// Triggered by n8n (or manually) to sync recent HubSpot meetings.
// Auth: webhook secret header.
// Query: ?days=1 (default: 1 day lookback)
// ---------------------------------------------------------------------------

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY!;
const RATE_LIMIT_MS = 120;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function hubspotGet(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` },
  });
  if (res.status === 429) {
    await sleep(10000);
    return hubspotGet(url);
  }
  if (!res.ok) throw new Error(`HubSpot GET ${res.status}`);
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
    await sleep(10000);
    return hubspotPost(url, body);
  }
  if (!res.ok) throw new Error(`HubSpot POST ${res.status}`);
  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    // Auth: webhook secret (n8n) OR authenticated admin session (in-app)
    const secret = request.headers.get("x-webhook-secret");
    const hasWebhookAuth = secret && secret === process.env.WEBHOOK_SECRET;

    if (!hasWebhookAuth) {
      const userClient = await createClient();
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      // Check admin role
      const adminClient = createAdminClient();
      const { data: profile } = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (!profile || !["admin", "owner"].includes(profile.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "1", 10);
    const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

    // 1. Load owner → email map
    const ownersData = await hubspotGet("https://api.hubapi.com/crm/v3/owners?limit=200");
    const ownerToEmail = new Map<string, string>();
    for (const o of ownersData.results || []) {
      if (o.email) ownerToEmail.set(o.id, o.email.toLowerCase());
    }

    // 2. Load sales rep email → ID
    const { data: reps } = await supabase.from("sales_reps").select("id, email").eq("is_active", true);
    const emailToRepId = new Map<string, string>();
    for (const r of reps || []) {
      if (r.email) emailToRepId.set(r.email.toLowerCase(), r.id);
    }

    // 3. Load contact map
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

    // 4. Search HubSpot meetings: recently modified OR starting within window
    //    Two filter groups = OR logic in HubSpot search API
    let after: string | undefined;
    let totalFetched = 0;
    const toUpsert: any[] = [];
    const seenIds = new Set<string>();

    while (true) {
      const searchBody: any = {
        filterGroups: [
          {
            filters: [{
              propertyName: "hs_lastmodifieddate",
              operator: "GTE",
              value: String(sinceMs),
            }],
          },
          {
            filters: [{
              propertyName: "hs_meeting_start_time",
              operator: "GTE",
              value: String(sinceMs),
            }],
          },
        ],
        properties: [
          "hs_meeting_title", "hs_meeting_start_time", "hs_meeting_end_time",
          "hs_meeting_outcome", "hubspot_owner_id", "hs_meeting_source",
        ],
        limit: 100,
      };
      if (after) searchBody.after = after;

      const data = await hubspotPost(
        "https://api.hubapi.com/crm/v3/objects/meetings/search",
        searchBody
      );
      const results = data.results || [];
      totalFetched += results.length;

      for (const mtg of results) {
        if (seenIds.has(mtg.id)) continue;
        seenIds.add(mtg.id);

        const ownerId = mtg.properties?.hubspot_owner_id;
        const ownerEmail = ownerId ? ownerToEmail.get(ownerId) : null;
        const repId = ownerEmail ? emailToRepId.get(ownerEmail) : null;

        if (!repId) continue;

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

      after = data.paging?.next?.after;
      if (!after || results.length === 0) break;
      await sleep(RATE_LIMIT_MS);
    }

    // 5. Fetch contact associations — create missing contacts from HubSpot
    let contactsCreated = 0;
    for (const mtg of toUpsert) {
      try {
        const assocData = await hubspotGet(
          `https://api.hubapi.com/crm/v3/objects/meetings/${mtg.hubspot_meeting_id}/associations/contacts`
        );
        const associations = assocData.results || [];
        if (associations.length > 0) {
          const hsContactId = associations[0].id?.toString();
          let supabaseContactId = hsContactId ? contactMap.get(hsContactId) : null;

          // If contact doesn't exist in MC, fetch from HubSpot and create
          if (!supabaseContactId && hsContactId) {
            try {
              await sleep(RATE_LIMIT_MS);
              const contactRes = await hubspotGet(
                `https://api.hubapi.com/crm/v3/objects/contacts/${hsContactId}?properties=email,firstname,lastname,phone`
              );
              const email = contactRes.properties?.email;
              if (email) {
                // Check if already exists by email
                const { data: existing } = await supabase
                  .from("contacts")
                  .select("id")
                  .eq("email", email.toLowerCase())
                  .maybeSingle();

                if (existing) {
                  supabaseContactId = existing.id;
                } else {
                  const { data: newContact } = await supabase
                    .from("contacts")
                    .insert({
                      hubspot_contact_id: hsContactId,
                      email: email.toLowerCase(),
                      first_name: contactRes.properties?.firstname || "",
                      last_name: contactRes.properties?.lastname || "",
                      phone: contactRes.properties?.phone || "",
                      lifecycle_stage: "lead",
                      metadata: {},
                    })
                    .select("id")
                    .single();

                  if (newContact) {
                    supabaseContactId = newContact.id;
                    contactMap.set(hsContactId, newContact.id);
                    contactsCreated++;
                  }
                }
              }
            } catch {
              // Skip contact creation errors — still sync the meeting without contact
            }
          }

          mtg.contact_id = supabaseContactId || null;
        }
        await sleep(RATE_LIMIT_MS);
      } catch {
        // Skip association errors
      }
    }

    // 6. Upsert to Supabase
    let upserted = 0;
    for (let i = 0; i < toUpsert.length; i += 100) {
      const batch = toUpsert.slice(i, i + 100);
      const { error } = await supabase
        .from("meetings")
        .upsert(batch, { onConflict: "hubspot_meeting_id" });
      if (!error) upserted += batch.length;
    }

    // 7. Log sync
    await supabase.from("sync_log").insert({
      workflow_name: "meeting_sync",
      status: "success",
      records_processed: totalFetched,
      records_created: upserted,
      triggered_by: "webhook",
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      fetched: totalFetched,
      upserted,
      with_rep: toUpsert.length,
      contacts_created: contactsCreated,
    });
  } catch (error) {
    console.error("[POST /api/admin/sync-meetings]", error);
    return NextResponse.json(
      { error: "Meeting sync failed" },
      { status: 500 }
    );
  }
}
