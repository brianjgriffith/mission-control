import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// PATCH /api/templates/:id
// Update a card template.
// ---------------------------------------------------------------------------

const ALLOWED_FIELDS = [
  "title", "description", "project_id", "priority", "category",
  "recurrence", "day_of_month", "day_of_week", "active",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = getDb();

    const sets: string[] = [];
    const values: unknown[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        sets.push(`${field} = ?`);
        values.push(body[field]);
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    sets.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE card_templates SET ${sets.join(", ")} WHERE id = ?`).run(...values);

    const template = db.prepare("SELECT * FROM card_templates WHERE id = ?").get(id);
    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("[PATCH /api/templates/:id]", error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/templates/:id
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const result = db.prepare("DELETE FROM card_templates WHERE id = ?").run(id);

    if (result.changes === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/templates/:id]", error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/templates/:id
// Generate cards from this template. Body: { month?: string (YYYY-MM) }
// Creates a new kanban card from the template and updates last_generated.
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const template = db.prepare("SELECT * FROM card_templates WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    let label: string;
    try {
      const body = await request.json();
      label = body.month || new Date().toISOString().slice(0, 7);
    } catch {
      label = new Date().toISOString().slice(0, 7);
    }

    // Create the card
    const cardId = uuidv4();
    const title = `${template.title} — ${label}`;

    // Get next sort order for inbox
    const maxRow = db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM kanban_cards WHERE column_id = 'todo'")
      .get() as { max_order: number };

    db.prepare(
      `INSERT INTO kanban_cards (id, title, description, column_id, priority, category, project_id, sort_order)
       VALUES (?, ?, ?, 'todo', ?, ?, ?, ?)`
    ).run(
      cardId,
      title,
      template.description as string,
      template.priority as string,
      template.category as string,
      template.project_id as string | null,
      maxRow.max_order + 1
    );

    // Log activity
    db.prepare(
      "INSERT INTO activity_log (id, card_id, project_id, action, details) VALUES (?, ?, ?, ?, ?)"
    ).run(uuidv4(), cardId, template.project_id as string | null, "card_created", `Generated from template "${template.title}" for ${label}`);

    // Update last_generated
    db.prepare("UPDATE card_templates SET last_generated = ?, updated_at = datetime('now') WHERE id = ?").run(
      new Date().toISOString(),
      id
    );

    const card = db.prepare("SELECT * FROM kanban_cards WHERE id = ?").get(cardId);
    const updatedTemplate = db.prepare("SELECT * FROM card_templates WHERE id = ?").get(id);

    return NextResponse.json({ card, template: updatedTemplate }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/templates/:id]", error);
    return NextResponse.json({ error: "Failed to generate card from template" }, { status: 500 });
  }
}
