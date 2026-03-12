import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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
    const db = getDb();

    const existing = db
      .prepare("SELECT id FROM rep_sales WHERE id = ?")
      .get(id) as { id: string } | undefined;

    if (!existing) {
      return NextResponse.json(
        { error: "Sales record not found" },
        { status: 404 }
      );
    }

    db.prepare("DELETE FROM rep_sales WHERE id = ?").run(id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/financials/sales/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete sales record" },
      { status: 500 }
    );
  }
}
