import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  getDb,
  type AssetRow,
  type KanbanCard,
  type ToolingMetadataRow,
} from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/assets/[id]
// Retrieve a single asset by ID, including:
//   - linked_cards (via asset_links join to kanban_cards)
//   - tooling_metadata (if exists)
//   - project_name and project_color from the parent project
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const asset = db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(id) as AssetRow | undefined;

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Linked kanban cards via asset_links.
    const linked_cards = db
      .prepare(
        `SELECT c.*
         FROM kanban_cards c
         INNER JOIN asset_links al ON al.card_id = c.id
         WHERE al.asset_id = ?
         ORDER BY c.sort_order ASC`
      )
      .all(id) as KanbanCard[];

    // Tooling metadata (may not exist).
    const tooling_metadata = (db
      .prepare("SELECT * FROM tooling_metadata WHERE asset_id = ?")
      .get(id) as ToolingMetadataRow | undefined) ?? null;

    // Parent project name and color.
    const project = db
      .prepare("SELECT name, color FROM projects WHERE id = ?")
      .get(asset.project_id) as { name: string; color: string } | undefined;

    return NextResponse.json({
      asset,
      linked_cards,
      tooling_metadata,
      project_name: project?.name ?? null,
      project_color: project?.color ?? null,
    });
  } catch (error) {
    console.error("[GET /api/assets/:id]", error);
    return NextResponse.json(
      { error: "Failed to fetch asset" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/assets/[id]
// Partially update an asset. Accepts any subset of mutable fields.
// Always bumps updated_at.
// ---------------------------------------------------------------------------

interface PatchAssetBody {
  name?: string;
  description?: string;
  url?: string;
  asset_type?: string;
  status?: string;
  performance_notes?: string;
  screenshot_url?: string;
  sort_order?: number;
}

const ALLOWED_FIELDS: (keyof PatchAssetBody)[] = [
  "name",
  "description",
  "url",
  "asset_type",
  "status",
  "performance_notes",
  "screenshot_url",
  "sort_order",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as PatchAssetBody;
    const db = getDb();

    const existing = db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(id) as AssetRow | undefined;

    if (!existing) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Build dynamic SET clause from provided fields.
    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        setClauses.push(`${field} = ?`);
        values.push(body[field as keyof PatchAssetBody] ?? null);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Always bump updated_at.
    setClauses.push("updated_at = datetime('now')");
    values.push(id); // for the WHERE clause

    db.prepare(
      `UPDATE assets SET ${setClauses.join(", ")} WHERE id = ?`
    ).run(...values);

    // Log activity.
    const changedFields = ALLOWED_FIELDS.filter((f) => f in body);
    db.prepare(
      "INSERT INTO activity_log (id, asset_id, project_id, action, details) VALUES (?, ?, ?, ?, ?)"
    ).run(
      uuidv4(),
      id,
      existing.project_id,
      "asset_updated",
      `Updated ${changedFields.join(", ")} on "${existing.name}"`
    );

    const asset = db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(id) as AssetRow;

    return NextResponse.json({ asset });
  } catch (error) {
    console.error("[PATCH /api/assets/:id]", error);
    return NextResponse.json(
      { error: "Failed to update asset" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/assets/[id]
// Permanently delete an asset and its related asset_links and
// tooling_metadata entries.
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(id) as AssetRow | undefined;

    if (!existing) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Delete related rows first, then the asset itself.
    const deleteAll = db.transaction(() => {
      db.prepare("DELETE FROM asset_links WHERE asset_id = ?").run(id);
      db.prepare("DELETE FROM tooling_metadata WHERE asset_id = ?").run(id);
      db.prepare("DELETE FROM assets WHERE id = ?").run(id);
    });
    deleteAll();

    // Log activity.
    db.prepare(
      "INSERT INTO activity_log (id, asset_id, project_id, action, details) VALUES (?, ?, ?, ?, ?)"
    ).run(
      uuidv4(),
      id,
      existing.project_id,
      "asset_deleted",
      `Deleted asset "${existing.name}"`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/assets/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete asset" },
      { status: 500 }
    );
  }
}
