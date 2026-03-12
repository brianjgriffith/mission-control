import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type AssetRow, type AssetLinkRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// POST /api/assets/[id]/links
// Link an asset to a kanban card.
// Body: { card_id }
// Handles UNIQUE constraint (asset_id, card_id) gracefully.
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assetId } = await params;
    const body = (await request.json()) as { card_id?: string };

    if (
      !body.card_id ||
      typeof body.card_id !== "string" ||
      !body.card_id.trim()
    ) {
      return NextResponse.json(
        { error: "card_id is required" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Verify the asset exists.
    const asset = db
      .prepare("SELECT id FROM assets WHERE id = ?")
      .get(assetId) as AssetRow | undefined;

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Verify the card exists.
    const card = db
      .prepare("SELECT id FROM kanban_cards WHERE id = ?")
      .get(body.card_id) as { id: string } | undefined;

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const linkId = uuidv4();

    db.prepare(
      "INSERT INTO asset_links (id, asset_id, card_id) VALUES (?, ?, ?)"
    ).run(linkId, assetId, body.card_id);

    const link = db
      .prepare("SELECT * FROM asset_links WHERE id = ?")
      .get(linkId) as AssetLinkRow;

    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/assets/:id/links]", error);

    // Handle UNIQUE constraint violation.
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      return NextResponse.json(
        { error: "This asset is already linked to that card" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create asset link" },
      { status: 500 }
    );
  }
}
