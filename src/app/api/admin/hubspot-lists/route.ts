import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY!;

// ---------------------------------------------------------------------------
// GET /api/admin/hubspot-lists
// Pulls all HubSpot lists, auto-classifies them, and marks which ones
// are already imported as funnels.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = createAdminClient();

    // 1. Fetch all HubSpot lists
    let allLists: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(
        `https://api.hubapi.com/contacts/v1/lists?count=250&offset=${offset}`,
        { headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}` } }
      );
      if (!res.ok) throw new Error(`HubSpot API ${res.status}`);
      const data = await res.json();
      allLists = allLists.concat(data.lists || []);
      hasMore = data["has-more"] || false;
      offset = data.offset || 0;
    }

    // 2. Get existing funnels to mark imported ones
    const { data: existingFunnels } = await supabase
      .from("funnels")
      .select("hubspot_list_id");
    const importedIds = new Set(
      (existingFunnels || []).map((f) => f.hubspot_list_id)
    );

    // 3. Classify each list
    const classified = allLists.map((l: any) => {
      const name = l.name || "";
      const size = l.metaData?.size || 0;
      const listType = l.listType || "";
      const id = String(l.listId);
      const nameLower = name.toLowerCase();

      let suggestedType = "other";
      let suggestedFunnelType = "";

      // Skip patterns
      if (nameLower.includes("[workflows]") || nameLower.includes("sync to"))
        suggestedType = "skip";
      else if (nameLower.startsWith("active:") || nameLower.startsWith("current:"))
        suggestedType = "skip";
      else if (nameLower.startsWith("product:"))
        suggestedType = "skip";
      else if (nameLower.startsWith("cohort:"))
        suggestedType = "skip";
      else if (
        nameLower.includes("didn't purchase") ||
        nameLower.includes("without vra") ||
        nameLower.includes("no vip") ||
        nameLower.includes("no starter")
      )
        suggestedType = "skip";
      // Funnel patterns
      else if (nameLower.includes("1k challenge") && (nameLower.includes("opt") || nameLower.includes("- st"))) {
        suggestedType = "funnel";
        suggestedFunnelType = "funnel";
      } else if (nameLower.includes("1k challenge") && nameLower.includes("vip")) {
        suggestedType = "funnel";
        suggestedFunnelType = "funnel";
      } else if (nameLower.includes("growth day") && (nameLower.includes("opt") || nameLower.includes("- st"))) {
        suggestedType = "funnel";
        suggestedFunnelType = "funnel";
      } else if (nameLower.includes("webclass") || nameLower.includes("web class")) {
        suggestedType = "funnel";
        suggestedFunnelType = "web_class";
      } else if (nameLower.includes("masterclass")) {
        suggestedType = "funnel";
        suggestedFunnelType = "web_class";
      } else if (nameLower.includes("optin") || nameLower.includes("opt-in") || nameLower.includes("opt in")) {
        suggestedType = "funnel";
        suggestedFunnelType = "lead_magnet";
      } else if (nameLower.includes("gwvl")) {
        suggestedType = "funnel";
        suggestedFunnelType = "lead_magnet";
      }

      return {
        hubspot_list_id: id,
        name,
        size,
        list_type: listType,
        suggested_type: suggestedType,
        suggested_funnel_type: suggestedFunnelType,
        already_imported: importedIds.has(id),
      };
    });

    // Sort: funnels first, then by size desc
    classified.sort((a, b) => {
      if (a.suggested_type === "funnel" && b.suggested_type !== "funnel") return -1;
      if (a.suggested_type !== "funnel" && b.suggested_type === "funnel") return 1;
      return b.size - a.size;
    });

    const funnelCount = classified.filter((c) => c.suggested_type === "funnel").length;
    const importedCount = classified.filter((c) => c.already_imported).length;

    return NextResponse.json({
      lists: classified,
      total: classified.length,
      suggested_funnels: funnelCount,
      already_imported: importedCount,
    });
  } catch (error) {
    console.error("[GET /api/admin/hubspot-lists]", error);
    return NextResponse.json(
      { error: "Failed to fetch HubSpot lists" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/hubspot-lists
// Import selected lists as funnels.
// Body: { lists: [{ hubspot_list_id, name, funnel_type }] }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const { lists } = body as {
      lists: Array<{
        hubspot_list_id: string;
        name: string;
        funnel_type: string;
      }>;
    };

    if (!lists || !Array.isArray(lists) || lists.length === 0) {
      return NextResponse.json(
        { error: "lists array is required" },
        { status: 400 }
      );
    }

    let imported = 0;
    let skipped = 0;

    for (const l of lists) {
      const { error } = await supabase.from("funnels").upsert(
        {
          name: l.name,
          funnel_type: l.funnel_type || "general",
          hubspot_list_id: l.hubspot_list_id,
          is_active: true,
          discovered_at: new Date().toISOString(),
        },
        { onConflict: "hubspot_list_id" }
      );

      if (error) {
        console.error(`Failed to import ${l.name}:`, error.message);
        skipped++;
      } else {
        imported++;
      }
    }

    return NextResponse.json({ imported, skipped });
  } catch (error) {
    console.error("[POST /api/admin/hubspot-lists]", error);
    return NextResponse.json(
      { error: "Failed to import lists" },
      { status: 500 }
    );
  }
}
