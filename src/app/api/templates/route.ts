import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/templates
// Returns all card templates, sorted by project then title.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const db = getDb();
    const templates = db
      .prepare("SELECT * FROM card_templates ORDER BY active DESC, project_id, title")
      .all();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("[GET /api/templates]", error);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/templates
// Create a new card template.
// ---------------------------------------------------------------------------

interface CreateTemplateBody {
  title: string;
  description?: string;
  project_id?: string | null;
  priority?: string;
  category?: string;
  recurrence?: string;
  day_of_month?: number;
  day_of_week?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateTemplateBody;

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const db = getDb();
    const id = uuidv4();

    db.prepare(
      `INSERT INTO card_templates (id, title, description, project_id, priority, category, recurrence, day_of_month, day_of_week)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      body.title.trim(),
      body.description ?? "",
      body.project_id ?? null,
      body.priority ?? "p3",
      body.category ?? "",
      body.recurrence ?? "monthly",
      body.day_of_month ?? 1,
      body.day_of_week ?? 1
    );

    const template = db.prepare("SELECT * FROM card_templates WHERE id = ?").get(id);
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/templates]", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
