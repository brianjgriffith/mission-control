import { NextRequest, NextResponse } from "next/server";
import { getDb, type ProjectRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/projects/[id]
// Retrieve a single project by ID, including aggregated stats:
//   card_count, active_card_count, asset_count.
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const project = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow | undefined;

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Aggregate stats via sub-queries.
    const stats = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM kanban_cards WHERE project_id = ?) AS card_count,
           (SELECT COUNT(*) FROM kanban_cards
            WHERE project_id = ? AND archived = 0 AND column_id != 'done') AS active_card_count,
           (SELECT COUNT(*) FROM assets WHERE project_id = ?) AS asset_count`
      )
      .get(id, id, id) as {
      card_count: number;
      active_card_count: number;
      asset_count: number;
    };

    return NextResponse.json({
      project: { ...project, ...stats },
    });
  } catch (error) {
    console.error("[GET /api/projects/:id]", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/projects/[id]
// Partially update a project. Accepts any subset of mutable fields.
// Always bumps updated_at.
// ---------------------------------------------------------------------------

interface PatchProjectBody {
  name?: string;
  slug?: string;
  description?: string;
  color?: string;
  icon?: string;
  project_type?: string;
  status?: string;
  sort_order?: number;
}

const ALLOWED_FIELDS: (keyof PatchProjectBody)[] = [
  "name",
  "slug",
  "description",
  "color",
  "icon",
  "project_type",
  "status",
  "sort_order",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as PatchProjectBody;
    const db = getDb();

    const existing = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow | undefined;

    if (!existing) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Build dynamic SET clause from provided fields.
    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        setClauses.push(`${field} = ?`);
        values.push(body[field as keyof PatchProjectBody] ?? null);
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
      `UPDATE projects SET ${setClauses.join(", ")} WHERE id = ?`
    ).run(...values);

    const project = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow;

    return NextResponse.json({ project });
  } catch (error) {
    console.error("[PATCH /api/projects/:id]", error);

    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      return NextResponse.json(
        { error: "A project with that slug already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/projects/[id]
// Soft-delete: sets status to 'archived' and bumps updated_at.
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow | undefined;

    if (!existing) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    db.prepare(
      "UPDATE projects SET status = 'archived', updated_at = datetime('now') WHERE id = ?"
    ).run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/projects/:id]", error);
    return NextResponse.json(
      { error: "Failed to archive project" },
      { status: 500 }
    );
  }
}
