import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/contacts
// Returns contacts with summary stats (charge count, meeting count, programs).
// Filters: ?search, ?program, ?has_meetings, ?has_charges, ?page, ?per_page
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search");
    const program = searchParams.get("program"); // accelerator, elite
    const hasMeetings = searchParams.get("has_meetings"); // "true"
    const hasCharges = searchParams.get("has_charges"); // "true"
    const page = parseInt(searchParams.get("page") || "1", 10);
    const perPage = Math.min(parseInt(searchParams.get("per_page") || "50", 10), 200);
    const sortBy = searchParams.get("sort_by") || "full_name";
    const sortDir = searchParams.get("sort_dir") === "desc";

    // If filtering by program, get contact IDs from students table
    let programContactIds: string[] | null = null;
    if (program) {
      const { data: students } = await supabase
        .from("students")
        .select("contact_id")
        .eq("program", program)
        .not("contact_id", "is", null);
      programContactIds = (students || []).map((s) => s.contact_id!).filter(Boolean);
      if (programContactIds.length === 0) {
        return NextResponse.json({
          contacts: [],
          pagination: { page, per_page: perPage, total: 0, total_pages: 0 },
        });
      }
    }

    // If filtering by has_meetings, get contact IDs from meetings table
    let meetingContactIds: string[] | null = null;
    if (hasMeetings === "true") {
      const { data: meetings } = await supabase
        .from("meetings")
        .select("contact_id")
        .not("contact_id", "is", null)
        .not("sales_rep_id", "is", null);
      meetingContactIds = [...new Set((meetings || []).map((m) => m.contact_id!).filter(Boolean))];
    }

    // If filtering by has_charges, get contact IDs from charges table
    let chargeContactIds: string[] | null = null;
    if (hasCharges === "true") {
      const { data: charges } = await supabase
        .from("charges")
        .select("contact_id")
        .not("contact_id", "is", null);
      chargeContactIds = [...new Set((charges || []).map((c) => c.contact_id!).filter(Boolean))];
    }

    // Intersect all ID filters
    let filteredIds: string[] | null = null;
    const idSets = [programContactIds, meetingContactIds, chargeContactIds].filter(Boolean) as string[][];
    if (idSets.length > 0) {
      const first = new Set(idSets[0]);
      for (let i = 1; i < idSets.length; i++) {
        const next = new Set(idSets[i]);
        for (const id of first) {
          if (!next.has(id)) first.delete(id);
        }
      }
      filteredIds = [...first];
      if (filteredIds.length === 0) {
        return NextResponse.json({
          contacts: [],
          pagination: { page, per_page: perPage, total: 0, total_pages: 0 },
        });
      }
    }

    // Allowed sort columns
    const ALLOWED_SORTS: Record<string, string> = {
      full_name: "full_name",
      email: "email",
      created_at: "created_at",
    };
    const safeSortBy = ALLOWED_SORTS[sortBy] || "full_name";

    // Build query
    let query = supabase
      .from("contacts")
      .select("id, hubspot_contact_id, email, first_name, last_name, full_name, phone, lifecycle_stage, created_at", { count: "exact" })
      .order(safeSortBy, { ascending: !sortDir });

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (filteredIds) {
      query = query.in("id", filteredIds.slice(0, 1000)); // Supabase limit
    }

    // Pagination
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    query = query.range(from, to);

    const { data: contacts, error, count } = await query;
    if (error) throw error;

    // Enrich with summary stats for each contact
    const contactIds = (contacts || []).map((c) => c.id);

    // Charge counts & totals
    const { data: chargeSummary } = await supabase
      .from("charges")
      .select("contact_id, amount")
      .in("contact_id", contactIds);

    const chargeStats = new Map<string, { count: number; total: number }>();
    for (const c of chargeSummary || []) {
      if (!c.contact_id) continue;
      const existing = chargeStats.get(c.contact_id) || { count: 0, total: 0 };
      existing.count++;
      existing.total += Number(c.amount) || 0;
      chargeStats.set(c.contact_id, existing);
    }

    // Meeting counts
    const { data: meetingSummary } = await supabase
      .from("meetings")
      .select("contact_id")
      .in("contact_id", contactIds)
      .not("sales_rep_id", "is", null);

    const meetingCounts = new Map<string, number>();
    for (const m of meetingSummary || []) {
      if (!m.contact_id) continue;
      meetingCounts.set(m.contact_id, (meetingCounts.get(m.contact_id) || 0) + 1);
    }

    // Student programs
    const { data: studentSummary } = await supabase
      .from("students")
      .select("contact_id, program, status")
      .in("contact_id", contactIds);

    const studentInfo = new Map<string, { programs: string[]; active: boolean }>();
    for (const s of studentSummary || []) {
      if (!s.contact_id) continue;
      const existing = studentInfo.get(s.contact_id) || { programs: [], active: false };
      if (!existing.programs.includes(s.program)) existing.programs.push(s.program);
      if (s.status === "active") existing.active = true;
      studentInfo.set(s.contact_id, existing);
    }

    // Build enriched response
    const enriched = (contacts || []).map((c) => ({
      ...c,
      charge_count: chargeStats.get(c.id)?.count || 0,
      total_spend: chargeStats.get(c.id)?.total || 0,
      meeting_count: meetingCounts.get(c.id) || 0,
      programs: studentInfo.get(c.id)?.programs || [],
      is_active_student: studentInfo.get(c.id)?.active || false,
    }));

    return NextResponse.json({
      contacts: enriched,
      pagination: {
        page,
        per_page: perPage,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / perPage),
      },
    });
  } catch (error) {
    console.error("[GET /api/contacts]", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}
