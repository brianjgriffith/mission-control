import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY!;

// ---------------------------------------------------------------------------
// GET /api/funnels/performance
// For each funnel, pulls the HubSpot list members, cross-references with
// charges to compute:
//   - Total opt-ins (list size)
//   - Purchased AFTER opt-in (real conversion)
//   - Purchased BEFORE opt-in (already customers)
//   - Never purchased
//   - Revenue attributed (post-opt-in only)
//   - Avg speed to purchase (days from opt-in to first post-opt-in charge)
//
// Optional: ?funnel_id=uuid to get detail for a single funnel
// ---------------------------------------------------------------------------

interface FunnelPerformance {
  funnel_id: string;
  funnel_name: string;
  funnel_type: string;
  hubspot_list_id: string;
  total_optins: number;
  purchased_after: number;
  purchased_before: number;
  never_purchased: number;
  conversion_rate: number; // purchased_after / total_optins
  revenue_after: number;
  avg_days_to_purchase: number | null;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const funnelId = searchParams.get("funnel_id");

    // Get funnels
    let funnelsQuery = supabase
      .from("funnels")
      .select("id, name, funnel_type, hubspot_list_id")
      .eq("is_active", true);

    if (funnelId) {
      funnelsQuery = funnelsQuery.eq("id", funnelId);
    }

    const { data: funnels, error: funnelError } = await funnelsQuery;
    if (funnelError) throw funnelError;

    const results: FunnelPerformance[] = [];

    for (const funnel of funnels || []) {
      if (!funnel.hubspot_list_id) continue;

      // Pull contacts from HubSpot list (up to 500 for performance)
      let listContacts: Array<{ email: string; addedAt: number }> = [];
      let hasMore = true;
      let vidOffset = 0;

      while (hasMore && listContacts.length < 500) {
        const url = `https://api.hubapi.com/contacts/v1/lists/${funnel.hubspot_list_id}/contacts/all?count=100&vidOffset=${vidOffset}&property=email`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` },
        });

        if (!res.ok) {
          hasMore = false;
          break;
        }

        const data = await res.json();
        for (const c of data.contacts || []) {
          const email = c.properties?.email?.value || "";
          const addedAt = c.addedAt || 0; // timestamp when added to list
          if (email) {
            listContacts.push({ email: email.toLowerCase(), addedAt });
          }
        }

        hasMore = data["has-more"] || false;
        vidOffset = data["vid-offset"] || 0;
      }

      if (listContacts.length === 0) {
        results.push({
          funnel_id: funnel.id,
          funnel_name: funnel.name,
          funnel_type: funnel.funnel_type,
          hubspot_list_id: funnel.hubspot_list_id,
          total_optins: 0,
          purchased_after: 0,
          purchased_before: 0,
          never_purchased: 0,
          conversion_rate: 0,
          revenue_after: 0,
          avg_days_to_purchase: null,
        });
        continue;
      }

      // Find these contacts in our DB
      const emailBatches: string[][] = [];
      for (let i = 0; i < listContacts.length; i += 50) {
        emailBatches.push(listContacts.slice(i, i + 50).map((c) => c.email));
      }

      const contactIdsByEmail = new Map<string, string>();
      for (const batch of emailBatches) {
        const { data: dbContacts } = await supabase
          .from("contacts")
          .select("id, email")
          .in("email", batch);

        for (const c of dbContacts || []) {
          contactIdsByEmail.set(c.email.toLowerCase(), c.id);
        }
      }

      // Build email → addedAt map
      const emailAddedAt = new Map<string, Date>();
      for (const c of listContacts) {
        if (c.addedAt > 0) {
          emailAddedAt.set(c.email, new Date(c.addedAt));
        }
      }

      // Get charges for matched contacts
      const contactIds = [...new Set(contactIdsByEmail.values())];
      let allCharges: any[] = [];

      if (contactIds.length > 0) {
        for (let i = 0; i < contactIds.length; i += 50) {
          const batch = contactIds.slice(i, i + 50);
          const { data: charges } = await supabase
            .from("charges")
            .select("contact_id, amount, charge_date")
            .in("contact_id", batch)
            .gt("amount", 0);
          allCharges = allCharges.concat(charges || []);
        }
      }

      // Build contact_id → email reverse map
      const contactIdToEmail = new Map<string, string>();
      for (const [email, id] of contactIdsByEmail) {
        contactIdToEmail.set(id, email);
      }

      // Analyze: for each contact, determine before/after
      let purchasedAfter = 0;
      let purchasedBefore = 0;
      let neverPurchased = 0;
      let revenueAfter = 0;
      let totalDaysToPurchase = 0;
      let daysCount = 0;

      const contactsWithCharges = new Map<string, any[]>();
      for (const charge of allCharges) {
        if (!contactsWithCharges.has(charge.contact_id)) {
          contactsWithCharges.set(charge.contact_id, []);
        }
        contactsWithCharges.get(charge.contact_id)!.push(charge);
      }

      // Process each list contact
      const processedEmails = new Set<string>();
      for (const lc of listContacts) {
        if (processedEmails.has(lc.email)) continue;
        processedEmails.add(lc.email);

        const contactId = contactIdsByEmail.get(lc.email);
        if (!contactId) {
          neverPurchased++;
          continue;
        }

        const charges = contactsWithCharges.get(contactId);
        if (!charges || charges.length === 0) {
          neverPurchased++;
          continue;
        }

        const optinDate = emailAddedAt.get(lc.email);
        if (!optinDate) {
          // No opt-in date available — count as purchased but can't determine before/after
          purchasedBefore++;
          continue;
        }

        // Check if any charge is AFTER opt-in date
        const afterCharges = charges.filter(
          (c: any) => new Date(c.charge_date) > optinDate
        );
        const beforeCharges = charges.filter(
          (c: any) => new Date(c.charge_date) <= optinDate
        );

        if (afterCharges.length > 0) {
          purchasedAfter++;
          revenueAfter += afterCharges.reduce(
            (sum: number, c: any) => sum + (Number(c.amount) || 0),
            0
          );

          // Speed to first post-opt-in purchase
          const firstAfter = afterCharges.sort(
            (a: any, b: any) =>
              new Date(a.charge_date).getTime() - new Date(b.charge_date).getTime()
          )[0];
          const days = Math.round(
            (new Date(firstAfter.charge_date).getTime() - optinDate.getTime()) /
              (1000 * 60 * 60 * 24)
          );
          totalDaysToPurchase += days;
          daysCount++;
        } else if (beforeCharges.length > 0) {
          purchasedBefore++;
        } else {
          neverPurchased++;
        }
      }

      const totalOptins = processedEmails.size;
      const conversionRate =
        totalOptins > 0 ? (purchasedAfter / totalOptins) * 100 : 0;
      const avgDays = daysCount > 0 ? Math.round(totalDaysToPurchase / daysCount) : null;

      results.push({
        funnel_id: funnel.id,
        funnel_name: funnel.name,
        funnel_type: funnel.funnel_type,
        hubspot_list_id: funnel.hubspot_list_id,
        total_optins: totalOptins,
        purchased_after: purchasedAfter,
        purchased_before: purchasedBefore,
        never_purchased: neverPurchased,
        conversion_rate: Math.round(conversionRate * 10) / 10,
        revenue_after: revenueAfter,
        avg_days_to_purchase: avgDays,
      });
    }

    // Sort by conversion rate desc
    results.sort((a, b) => b.conversion_rate - a.conversion_rate);

    return NextResponse.json({ funnels: results });
  } catch (error) {
    console.error("[GET /api/funnels/performance]", error);
    return NextResponse.json(
      { error: "Failed to compute funnel performance" },
      { status: 500 }
    );
  }
}
