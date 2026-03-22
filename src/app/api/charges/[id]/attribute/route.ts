import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// POST /api/charges/[id]/attribute
// Assign or update a charge's sales rep attribution.
// Body: { sales_rep_id: string } or { sales_rep_id: null } to remove
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const body = await request.json();
    const { sales_rep_id } = body as { sales_rep_id: string | null };

    if (sales_rep_id === null) {
      // Remove attribution
      await supabase
        .from("charge_attributions")
        .delete()
        .eq("charge_id", id);

      return NextResponse.json({ success: true, removed: true });
    }

    // Upsert attribution
    const { data, error } = await supabase
      .from("charge_attributions")
      .upsert(
        {
          charge_id: id,
          sales_rep_id,
          attribution_type: "manual",
        },
        { onConflict: "charge_id" }
      )
      .select("id, sales_rep_id, attribution_type, sales_reps (id, name)")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, attribution: data });
  } catch (error) {
    console.error("[POST /api/charges/[id]/attribute]", error);
    return NextResponse.json(
      { error: "Failed to attribute charge" },
      { status: 500 }
    );
  }
}
