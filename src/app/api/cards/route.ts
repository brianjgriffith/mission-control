import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type KanbanCard } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/cards
// Returns all cards. Pass ?archived=true to include only archived cards.
// Pass ?project_id=xxx to filter by project.
// By default returns non-archived cards sorted by column_id then sort_order.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const archivedParam = searchParams.get("archived");
    const showArchived = archivedParam === "true" || archivedParam === "1";
    const projectId = searchParams.get("project_id");

    // Auto-archive: move done cards older than 7 days to archived
    db.prepare(
      `UPDATE kanban_cards
       SET archived = 1, updated_at = datetime('now')
       WHERE column_id = 'done'
         AND archived = 0
         AND updated_at < datetime('now', '-7 days')`
    ).run();

    const filters: string[] = ["archived = ?"];
    const values: unknown[] = [showArchived ? 1 : 0];

    if (projectId) {
      filters.push("project_id = ?");
      values.push(projectId);
    }

    const cards = db
      .prepare(
        `SELECT * FROM kanban_cards
         WHERE ${filters.join(" AND ")}
         ORDER BY column_id, sort_order ASC`
      )
      .all(...values) as KanbanCard[];

    return NextResponse.json({ cards });
  } catch (error) {
    console.error("[GET /api/cards]", error);
    return NextResponse.json(
      { error: "Failed to fetch cards" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/cards
// Create a new card.
// Body: { title, description?, column_id?, priority?, category?,
//         due_date?, project_id? }
// ---------------------------------------------------------------------------

interface CreateCardBody {
  title: string;
  description?: string;
  column_id?: string;
  priority?: string;
  category?: string;
  due_date?: string | null;
  project_id?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateCardBody;

    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json(
        { error: "title is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    const db = getDb();

    const id = uuidv4();
    const columnId = body.column_id ?? "inbox";
    const priority = body.priority ?? "p3";
    const category = body.category ?? "";
    const description = body.description ?? "";
    const dueDate = body.due_date ?? null;
    const projectId = body.project_id ?? null;

    // Determine the next sort_order for the target column.
    const maxRow = db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM kanban_cards WHERE column_id = ?"
      )
      .get(columnId) as { max_order: number };

    const sortOrder = maxRow.max_order + 1;

    db.prepare(
      `INSERT INTO kanban_cards (id, title, description, column_id, priority, category, due_date, project_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, body.title.trim(), description, columnId, priority, category, dueDate, projectId, sortOrder);

    // Log activity.
    db.prepare(
      "INSERT INTO activity_log (id, card_id, project_id, action, details) VALUES (?, ?, ?, ?, ?)"
    ).run(uuidv4(), id, projectId, "card_created", `Created card "${body.title.trim()}"`);

    const card = db
      .prepare("SELECT * FROM kanban_cards WHERE id = ?")
      .get(id) as KanbanCard;

    return NextResponse.json({ card }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/cards]", error);
    return NextResponse.json(
      { error: "Failed to create card" },
      { status: 500 }
    );
  }
}
