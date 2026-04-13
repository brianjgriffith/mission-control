import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// POST /api/admin/sync-contacts
// Triggered by n8n (daily cron) or manually to incrementally sync
// new/updated contacts from HubSpot into Supabase.
// Auth: webhook secret header.
// Query: ?days=1 (default: 1 day lookback)
// ---------------------------------------------------------------------------

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY!;
const RATE_LIMIT_MS = 120;
const CONTACT_PROPERTIES = [
  "email",
  "firstname",
  "lastname",
  "phone",
  "lifecyclestage",
  "first_conversion_date",
  "recent_conversion_date",
  "hubspot_owner_id",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function hubspotPost(url: string, body: unknown): Promise<any> {
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
    // Auth check
    const secret = request.headers.get("x-webhook-secret");
    if (!secret || secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "1", 10);
    const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

    // 1. Search HubSpot for contacts modified since cutoff
    let after: string | undefined;
    let totalFetched = 0;
    const contacts: Array<{
      hubspot_contact_id: string;
      email: string;
      first_name: string;
      last_name: string;
      phone: string;
      lifecycle_stage: string;
      first_conversion_date: string | null;
      recent_conversion_date: string | null;
      hubspot_owner_id: string | null;
    }> = [];

    while (true) {
      const searchBody: Record<string, unknown> = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "lastmodifieddate",
                operator: "GTE",
                value: String(sinceMs),
              },
            ],
          },
        ],
        properties: CONTACT_PROPERTIES,
        limit: 100,
      };
      if (after) searchBody.after = after;

      const data = await hubspotPost(
        "https://api.hubapi.com/crm/v3/objects/contacts/search",
        searchBody
      );
      const results = data.results || [];
      totalFetched += results.length;

      for (const c of results) {
        const email = c.properties?.email;
        if (!email) continue; // Skip contacts without email

        contacts.push({
          hubspot_contact_id: c.id,
          email: email.toLowerCase(),
          first_name: c.properties?.firstname || "",
          last_name: c.properties?.lastname || "",
          phone: c.properties?.phone || "",
          lifecycle_stage: c.properties?.lifecyclestage || "",
          first_conversion_date: c.properties?.first_conversion_date || null,
          recent_conversion_date: c.properties?.recent_conversion_date || null,
          hubspot_owner_id: c.properties?.hubspot_owner_id || null,
        });
      }

      after = data.paging?.next?.after;
      if (!after || results.length === 0) break;
      await sleep(RATE_LIMIT_MS);
    }

    // 2. Upsert to Supabase in batches
    let upserted = 0;
    let errors = 0;
    for (let i = 0; i < contacts.length; i += 100) {
      const batch = contacts.slice(i, i + 100);
      const { error } = await supabase
        .from("contacts")
        .upsert(batch, { onConflict: "hubspot_contact_id" });

      if (error) {
        console.error("[sync-contacts] batch upsert error:", error.message);
        errors += batch.length;
      } else {
        upserted += batch.length;
      }
    }

    // 3. Log sync
    const status = errors > 0 ? (upserted > 0 ? "partial" : "error") : "success";
    await supabase.from("sync_log").insert({
      workflow_name: "hubspot_contact_sync",
      status,
      records_processed: totalFetched,
      records_created: upserted,
      records_skipped: totalFetched - contacts.length, // contacts without email
      error_message: errors > 0 ? `${errors} records failed to upsert` : null,
      triggered_by: "webhook",
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      fetched: totalFetched,
      upserted,
      skipped: totalFetched - contacts.length,
      errors,
      days_lookback: days,
    });
  } catch (error) {
    const supabase = createAdminClient();
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[POST /api/admin/sync-contacts]", error);

    // Log failed sync
    try {
      await supabase.from("sync_log").insert({
        workflow_name: "hubspot_contact_sync",
        status: "error",
        error_message: message,
        triggered_by: "webhook",
        completed_at: new Date().toISOString(),
      });
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json(
      { error: "Contact sync failed", details: message },
      { status: 500 }
    );
  }
}
