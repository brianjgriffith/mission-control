import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import type { ColumnId } from "@/lib/types";

// ---------------------------------------------------------------------------
// POST /api/cards/bulk
// Perform bulk operations on multiple cards at once.
// Body: { card_ids: string[], action: "move" | "archive", column_id?: ColumnId }
// ---------------------------------------------------------------------------

const VALID_COLUMNS: ColumnId[] = [
  "inbox",
  "todo",
  "in_progress",
  "blocked",
  "done",
];

interface BulkBody {
  card_ids: string[];
  action: "move" | "archive";
  column_id?: ColumnId;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BulkBody;

    // Validate card_ids
    if (
      !Array.isArray(body.card_ids) ||
      body.card_ids.length === 0 ||
      !body.card_ids.every((id) => typeof id === "string")
    ) {
      return NextResponse.json(
        { error: "card_ids must be a non-empty array of strings" },
        { status: 400 }
      );
    }

    // Validate action
    if (body.action !== "move" && body.action !== "archive") {
      return NextResponse.json(
        { error: 'action must be "move" or "archive"' },
        { status: 400 }
      );
    }

    // For move action, column_id is required
    if (body.action === "move") {
      if (!body.column_id || !VALID_COLUMNS.includes(body.column_id)) {
        return NextResponse.json(
          { error: "column_id is required for move action and must be a valid column" },
          { status: 400 }
        );
      }
    }

    const db = getDb();

    // Use a transaction for atomicity
    const result = db.transaction(() => {
      let updated = 0;

      if (body.action === "move" && body.column_id) {
        const stmt = db.prepare(
          `UPDATE kanban_cards
           SET column_id = ?, updated_at = datetime('now')
           WHERE id = ? AND archived = 0`
        );

        for (const cardId of body.card_ids) {
          const info = stmt.run(body.column_id, cardId);
          updated += info.changes;
        }

        // Log activity for bulk move
        db.prepare(
          "INSERT INTO activity_log (id, card_id, project_id, action, details) VALUES (?, ?, ?, ?, ?)"
        ).run(
          uuidv4(),
          null,
          null,
          "bulk_move",
          `Moved ${updated} cards to ${body.column_id}`
        );
      } else if (body.action === "archive") {
        const stmt = db.prepare(
          `UPDATE kanban_cards
           SET archived = 1, updated_at = datetime('now')
           WHERE id = ? AND archived = 0`
        );

        for (const cardId of body.card_ids) {
          const info = stmt.run(cardId);
          updated += info.changes;
        }

        // Log activity for bulk archive
        db.prepare(
          "INSERT INTO activity_log (id, card_id, project_id, action, details) VALUES (?, ?, ?, ?, ?)"
        ).run(
          uuidv4(),
          null,
          null,
          "bulk_archive",
          `Archived ${updated} cards`
        );
      }

      return updated;
    })();

    return NextResponse.json({ updated: result });
  } catch (error) {
    console.error("[POST /api/cards/bulk]", error);
    return NextResponse.json(
      { error: "Failed to perform bulk operation" },
      { status: 500 }
    );
  }
}
