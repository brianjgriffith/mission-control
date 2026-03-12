import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// DELETE /api/financials/revenue/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db
      .prepare("SELECT id FROM revenue_snapshots WHERE id = ?")
      .get(id);

    if (!existing) {
      return NextResponse.json(
        { error: "Snapshot not found" },
        { status: 404 }
      );
    }

    db.prepare("DELETE FROM revenue_snapshots WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/financials/revenue/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete snapshot" },
      { status: 500 }
    );
  }
}
