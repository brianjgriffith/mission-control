import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type ProjectRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/projects
// Returns all projects. Optional ?status=active filter.
// Sorted by sort_order ascending.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = "SELECT * FROM projects";
    const queryParams: unknown[] = [];

    if (status) {
      query += " WHERE status = ?";
      queryParams.push(status);
    }

    query += " ORDER BY sort_order ASC";

    const projects = db.prepare(query).all(...queryParams) as ProjectRow[];

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("[GET /api/projects]", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/projects
// Create a new project.
// Body: { name, slug?, color?, icon?, project_type?, description? }
// ---------------------------------------------------------------------------

interface CreateProjectBody {
  name: string;
  slug?: string;
  color?: string;
  icon?: string;
  project_type?: string;
  description?: string;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateProjectBody;

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "name is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    const db = getDb();

    const id = uuidv4();
    const name = body.name.trim();
    const slug = body.slug?.trim() || generateSlug(name);
    const color = body.color ?? "#6366f1";
    const icon = body.icon ?? "";
    const projectType = body.project_type ?? "client";
    const description = body.description ?? "";

    // Determine the next sort_order.
    const maxRow = db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM projects"
      )
      .get() as { max_order: number };

    const sortOrder = maxRow.max_order + 1;

    db.prepare(
      `INSERT INTO projects (id, name, slug, description, color, icon, project_type, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, slug, description, color, icon, projectType, sortOrder);

    const project = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow;

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projects]", error);

    // Handle UNIQUE constraint violation on slug.
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
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
