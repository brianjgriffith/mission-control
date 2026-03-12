import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// DELETE /api/financials/deals/[id]
// Delete a single deal record by ID.
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db
      .prepare("SELECT id FROM deals WHERE id = ?")
      .get(id) as { id: string } | undefined;

    if (!existing) {
      return NextResponse.json(
        { error: "Deal not found" },
        { status: 404 }
      );
    }

    db.prepare("DELETE FROM deals WHERE id = ?").run(id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/financials/deals/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete deal" },
      { status: 500 }
    );
  }
}
