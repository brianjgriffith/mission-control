import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// DELETE /api/financials/sales/[id]
// Delete a single rep_sales record by ID.
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // Check existence first
    const { data: existing, error: findError } = await supabase
      .from("rep_sales")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (findError) throw findError;

    if (!existing) {
      return NextResponse.json(
        { error: "Sales record not found" },
        { status: 404 }
      );
    }

    const { error: deleteError } = await supabase
      .from("rep_sales")
      .delete()
      .eq("id", id);
    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/financials/sales/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete sales record" },
      { status: 500 }
    );
  }
}
