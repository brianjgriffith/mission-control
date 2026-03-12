import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type KanbanCard, type AssetRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/cards/[id]
// Retrieve a single card by its ID, including linked assets.
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const card = db
      .prepare("SELECT * FROM kanban_cards WHERE id = ?")
      .get(id) as KanbanCard | undefined;

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Linked assets via asset_links junction table
    const linked_assets = db
      .prepare(
        `SELECT a.*
         FROM assets a
         INNER JOIN asset_links al ON al.asset_id = a.id
         WHERE al.card_id = ?
         ORDER BY a.name ASC`
      )
      .all(id) as AssetRow[];

    return NextResponse.json({ card, linked_assets });
  } catch (error) {
    console.error("[GET /api/cards/:id]", error);
    return NextResponse.json(
      { error: "Failed to fetch card" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/cards/[id]
// Partially update a card. Accepts any subset of mutable card fields.
// Automatically bumps updated_at. Logs activity when column_id changes.
// ---------------------------------------------------------------------------

interface PatchCardBody {
  title?: string;
  description?: string;
  column_id?: string;
  priority?: string;
  category?: string;
  due_date?: string | null;
  roadmap_id?: string | null;
  sort_order?: number;
  archived?: number;
  project_id?: string | null;
}

const ALLOWED_FIELDS: (keyof PatchCardBody)[] = [
  "title",
  "description",
  "column_id",
  "priority",
  "category",
  "due_date",
  "roadmap_id",
  "sort_order",
  "archived",
  "project_id",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as PatchCardBody;
    const db = getDb();

    // Verify card exists.
    const existing = db
      .prepare("SELECT * FROM kanban_cards WHERE id = ?")
      .get(id) as KanbanCard | undefined;

    if (!existing) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Build dynamic SET clause from provided fields.
    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        setClauses.push(`${field} = ?`);
        values.push(body[field as keyof PatchCardBody] ?? null);
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
      `UPDATE kanban_cards SET ${setClauses.join(", ")} WHERE id = ?`
    ).run(...values);

    // Log activity when the column changes (card moved).
    if (body.column_id && body.column_id !== existing.column_id) {
      db.prepare(
        "INSERT INTO activity_log (id, card_id, action, details) VALUES (?, ?, ?, ?)"
      ).run(
        uuidv4(),
        id,
        "card_moved",
        `Moved "${existing.title}" from ${existing.column_id} to ${body.column_id}`
      );
    }

    // Log generic update when there is no column change.
    if (!body.column_id || body.column_id === existing.column_id) {
      const changedFields = ALLOWED_FIELDS.filter(
        (f) => f in body && f !== "column_id"
      );
      if (changedFields.length > 0) {
        db.prepare(
          "INSERT INTO activity_log (id, card_id, action, details) VALUES (?, ?, ?, ?)"
        ).run(
          uuidv4(),
          id,
          "card_updated",
          `Updated ${changedFields.join(", ")} on "${existing.title}"`
        );
      }
    }

    const card = db
      .prepare("SELECT * FROM kanban_cards WHERE id = ?")
      .get(id) as KanbanCard;

    return NextResponse.json({ card });
  } catch (error) {
    console.error("[PATCH /api/cards/:id]", error);
    return NextResponse.json(
      { error: "Failed to update card" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/cards/[id]
// Permanently delete a card and log the action.
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db
      .prepare("SELECT * FROM kanban_cards WHERE id = ?")
      .get(id) as KanbanCard | undefined;

    if (!existing) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    db.prepare("DELETE FROM kanban_cards WHERE id = ?").run(id);

    // Log activity.
    db.prepare(
      "INSERT INTO activity_log (id, card_id, action, details) VALUES (?, ?, ?, ?)"
    ).run(uuidv4(), id, "card_deleted", `Deleted card "${existing.title}"`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/cards/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete card" },
      { status: 500 }
    );
  }
}
