import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/contacts/search?q=john
// Lightweight contact search for typeahead/assignment UIs.
// Returns up to 10 matches by name or email.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const q = request.nextUrl.searchParams.get("q")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ contacts: [] });
    }

    const { data, error } = await supabase
      .from("contacts")
      .select("id, full_name, email")
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .order("full_name", { ascending: true })
      .limit(10);

    if (error) throw error;

    return NextResponse.json({ contacts: data || [] });
  } catch (error) {
    console.error("[GET /api/contacts/search]", error);
    return NextResponse.json(
      { error: "Failed to search contacts" },
      { status: 500 }
    );
  }
}
