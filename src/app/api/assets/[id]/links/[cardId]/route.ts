import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// DELETE /api/assets/[id]/links/[cardId]
// Remove the link between an asset and a card.
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  try {
    const { id: assetId, cardId } = await params;
    const db = getDb();

    const result = db
      .prepare("DELETE FROM asset_links WHERE asset_id = ? AND card_id = ?")
      .run(assetId, cardId);

    if (result.changes === 0) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/assets/:id/links/:cardId]", error);
    return NextResponse.json(
      { error: "Failed to remove asset link" },
      { status: 500 }
    );
  }
}
