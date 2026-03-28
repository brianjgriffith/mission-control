import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY!;
const RATE_LIMIT_MS = 120;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function hubspotGet(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` } });
  if (res.status === 429) { await sleep(10000); return hubspotGet(url); }
  if (!res.ok) throw new Error(`HubSpot ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// GET /api/funnels/[id]/contacts
// Returns contacts in this funnel with their purchase status.
// Filter: ?status=purchased_after|purchased_before|never_purchased|all
// Paginated: ?page=1&per_page=50
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const statusFilter = searchParams.get("status") || "all";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const perPage = Math.min(parseInt(searchParams.get("per_page") || "50", 10), 100);
    const search = searchParams.get("search") || "";

    // Get funnel
    const { data: funnel } = await supabase
      .from("funnels")
      .select("id, name, hubspot_list_id")
      .eq("id", id)
      .single();

    if (!funnel?.hubspot_list_id) {
      return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
    }

    // Pull contacts from HubSpot (up to 1000 for the contacts view)
    const listContacts: Array<{ email: string; addedAt: number; firstName: string; lastName: string }> = [];
    let hasMore = true;
    let vidOffset = 0;

    while (hasMore && listContacts.length < 1000) {
      const data = await hubspotGet(
        `https://api.hubapi.com/contacts/v1/lists/${funnel.hubspot_list_id}/contacts/all?count=100&vidOffset=${vidOffset}&property=email&property=firstname&property=lastname`
      );
      for (const c of data.contacts || []) {
        const email = c.properties?.email?.value || "";
        if (email) {
          listContacts.push({
            email: email.toLowerCase(),
            addedAt: c.addedAt || 0,
            firstName: c.properties?.firstname?.value || "",
            lastName: c.properties?.lastname?.value || "",
          });
        }
      }
      hasMore = data["has-more"] || false;
      vidOffset = data["vid-offset"] || 0;
      await sleep(RATE_LIMIT_MS);
    }

    // Look up contacts in our DB
    const emails = listContacts.map((c) => c.email);
    const emailToContact = new Map<string, { id: string; email: string }>();

    for (let i = 0; i < emails.length; i += 50) {
      const batch = emails.slice(i, i + 50);
      const { data: dbContacts } = await supabase
        .from("contacts")
        .select("id, email")
        .in("email", batch);
      for (const c of dbContacts || []) {
        emailToContact.set(c.email.toLowerCase(), c);
      }
    }

    // Get charges for matched contacts
    const contactIds = [...new Set([...emailToContact.values()].map((c) => c.id))];
    const chargesByContact = new Map<string, Array<{ amount: number; date: Date; product: string }>>();

    for (let i = 0; i < contactIds.length; i += 50) {
      const batch = contactIds.slice(i, i + 50);
      const { data: charges } = await supabase
        .from("charges")
        .select("contact_id, amount, charge_date, products(short_name, group_name)")
        .in("contact_id", batch)
        .gt("amount", 0)
        .order("charge_date", { ascending: true });

      for (const c of charges || []) {
        if (!chargesByContact.has(c.contact_id)) chargesByContact.set(c.contact_id, []);
        chargesByContact.get(c.contact_id)!.push({
          amount: Number(c.amount),
          date: new Date(c.charge_date),
          product: (c as any).products?.group_name || (c as any).products?.short_name || "Other",
        });
      }
    }

    // Classify each contact
    interface FunnelContact {
      email: string;
      name: string;
      contact_id: string | null;
      opted_in: string;
      status: "purchased_after" | "purchased_before" | "never_purchased";
      first_purchase_after: { product: string; amount: number; date: string; days_after: number } | null;
      total_spend_after: number;
      total_spend_before: number;
    }

    const allContacts: FunnelContact[] = [];

    const processed = new Set<string>();
    for (const lc of listContacts) {
      if (processed.has(lc.email)) continue;
      processed.add(lc.email);

      const dbContact = emailToContact.get(lc.email);
      const contactId = dbContact?.id || null;
      const name = `${lc.firstName} ${lc.lastName}`.trim() || lc.email;
      const optinDate = lc.addedAt > 0 ? new Date(lc.addedAt) : null;

      let status: FunnelContact["status"] = "never_purchased";
      let firstPurchaseAfter: FunnelContact["first_purchase_after"] = null;
      let totalAfter = 0;
      let totalBefore = 0;

      if (contactId) {
        const charges = chargesByContact.get(contactId) || [];

        if (charges.length > 0 && optinDate) {
          const after = charges.filter((c) => c.date > optinDate);
          const before = charges.filter((c) => c.date <= optinDate);

          totalAfter = after.reduce((s, c) => s + c.amount, 0);
          totalBefore = before.reduce((s, c) => s + c.amount, 0);

          if (after.length > 0) {
            status = "purchased_after";
            const first = after[0];
            const days = Math.round((first.date.getTime() - optinDate.getTime()) / 86400000);
            firstPurchaseAfter = {
              product: first.product,
              amount: first.amount,
              date: first.date.toISOString(),
              days_after: days,
            };
          } else if (before.length > 0) {
            status = "purchased_before";
          }
        } else if (charges.length > 0) {
          status = "purchased_before";
          totalBefore = charges.reduce((s, c) => s + c.amount, 0);
        }
      }

      allContacts.push({
        email: lc.email,
        name,
        contact_id: contactId,
        opted_in: optinDate ? optinDate.toISOString() : "",
        status,
        first_purchase_after: firstPurchaseAfter,
        total_spend_after: totalAfter,
        total_spend_before: totalBefore,
      });
    }

    // Apply search filter
    let filtered = allContacts;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((c) =>
        c.name.toLowerCase().includes(q) || c.email.includes(q)
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }

    // Sort: purchased_after first (by spend desc), then purchased_before, then never
    filtered.sort((a, b) => {
      const order = { purchased_after: 0, purchased_before: 1, never_purchased: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return b.total_spend_after - a.total_spend_after;
    });

    // Paginate
    const total = filtered.length;
    const start = (page - 1) * perPage;
    const paged = filtered.slice(start, start + perPage);

    // Counts
    const counts = {
      all: allContacts.length,
      purchased_after: allContacts.filter((c) => c.status === "purchased_after").length,
      purchased_before: allContacts.filter((c) => c.status === "purchased_before").length,
      never_purchased: allContacts.filter((c) => c.status === "never_purchased").length,
    };

    return NextResponse.json({
      contacts: paged,
      counts,
      pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  } catch (error) {
    console.error("[GET /api/funnels/[id]/contacts]", error);
    return NextResponse.json({ error: "Failed to fetch funnel contacts" }, { status: 500 });
  }
}
