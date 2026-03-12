import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type KanbanCard } from "@/lib/db";

// ---------------------------------------------------------------------------
// POST /api/cards/reorder
// Move a card to a target column at a specific index and recalculate
// sort_order values for every card in the target column.
//
// Body: { cardId: string, targetColumn: string, newIndex: number }
// ---------------------------------------------------------------------------

interface ReorderBody {
  cardId: string;
  targetColumn: string;
  newIndex: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ReorderBody;

    if (!body.cardId || !body.targetColumn || body.newIndex == null) {
      return NextResponse.json(
        {
          error:
            "cardId, targetColumn, and newIndex are required",
        },
        { status: 400 }
      );
    }

    const db = getDb();

    const card = db
      .prepare("SELECT * FROM kanban_cards WHERE id = ?")
      .get(body.cardId) as KanbanCard | undefined;

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const previousColumn = card.column_id;

    // Run the entire reorder in a transaction for consistency.
    const reorder = db.transaction(() => {
      // 1. Update the card's column_id to the target column.
      db.prepare("UPDATE kanban_cards SET column_id = ?, updated_at = datetime('now') WHERE id = ?").run(
        body.targetColumn,
        body.cardId
      );

      // 2. Get all non-archived cards in the target column, ordered by current
      //    sort_order, excluding the card being moved so we can reinsert it.
      const columnCards = db
        .prepare(
          `SELECT id FROM kanban_cards
           WHERE column_id = ? AND archived = 0 AND id != ?
           ORDER BY sort_order ASC`
        )
        .all(body.targetColumn, body.cardId) as { id: string }[];

      // 3. Splice the moved card into the correct position.
      const clampedIndex = Math.max(0, Math.min(body.newIndex, columnCards.length));
      columnCards.splice(clampedIndex, 0, { id: body.cardId });

      // 4. Re-assign sort_order for every card in the column.
      const updateOrder = db.prepare(
        "UPDATE kanban_cards SET sort_order = ? WHERE id = ?"
      );
      for (let i = 0; i < columnCards.length; i++) {
        updateOrder.run(i, columnCards[i].id);
      }

      // 5. If the card moved to a different column, also recalculate the
      //    previous column's sort_order to close any gaps.
      if (previousColumn !== body.targetColumn) {
        const prevCards = db
          .prepare(
            `SELECT id FROM kanban_cards
             WHERE column_id = ? AND archived = 0
             ORDER BY sort_order ASC`
          )
          .all(previousColumn) as { id: string }[];

        for (let i = 0; i < prevCards.length; i++) {
          updateOrder.run(i, prevCards[i].id);
        }
      }
    });

    reorder();

    // Log column change if applicable.
    if (previousColumn !== body.targetColumn) {
      db.prepare(
        "INSERT INTO activity_log (id, card_id, action, details) VALUES (?, ?, ?, ?)"
      ).run(
        uuidv4(),
        body.cardId,
        "card_moved",
        `Moved "${card.title}" from ${previousColumn} to ${body.targetColumn}`
      );
    }

    // Return the updated set of cards in the target column.
    const updatedCards = db
      .prepare(
        `SELECT * FROM kanban_cards
         WHERE column_id = ? AND archived = 0
         ORDER BY sort_order ASC`
      )
      .all(body.targetColumn) as KanbanCard[];

    return NextResponse.json({ cards: updatedCards });
  } catch (error) {
    console.error("[POST /api/cards/reorder]", error);
    return NextResponse.json(
      { error: "Failed to reorder cards" },
      { status: 500 }
    );
  }
}
