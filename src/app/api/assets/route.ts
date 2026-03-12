import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type AssetRow, type ProjectRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/assets
// Returns all assets. Supports optional query filters:
//   ?project_id=xxx  ?asset_type=xxx  ?status=xxx
// Sorted by sort_order ascending.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const filters: string[] = [];
    const values: unknown[] = [];

    const projectId = searchParams.get("project_id");
    if (projectId) {
      filters.push("project_id = ?");
      values.push(projectId);
    }

    const assetType = searchParams.get("asset_type");
    if (assetType) {
      filters.push("asset_type = ?");
      values.push(assetType);
    }

    const status = searchParams.get("status");
    if (status) {
      filters.push("status = ?");
      values.push(status);
    }

    let query = "SELECT * FROM assets";
    if (filters.length > 0) {
      query += " WHERE " + filters.join(" AND ");
    }
    query += " ORDER BY sort_order ASC";

    const assets = db.prepare(query).all(...values) as AssetRow[];

    return NextResponse.json({ assets });
  } catch (error) {
    console.error("[GET /api/assets]", error);
    return NextResponse.json(
      { error: "Failed to fetch assets" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/assets
// Create a new asset.
// Body: { project_id, name, url?, asset_type?, status?, description? }
// Validates that the referenced project exists.
// ---------------------------------------------------------------------------

interface CreateAssetBody {
  project_id: string;
  name: string;
  url?: string;
  asset_type?: string;
  status?: string;
  description?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateAssetBody;

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "name is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (
      !body.project_id ||
      typeof body.project_id !== "string" ||
      !body.project_id.trim()
    ) {
      return NextResponse.json(
        { error: "project_id is required" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Validate that the referenced project exists.
    const project = db
      .prepare("SELECT id FROM projects WHERE id = ?")
      .get(body.project_id) as ProjectRow | undefined;

    if (!project) {
      return NextResponse.json(
        { error: "Referenced project not found" },
        { status: 404 }
      );
    }

    const id = uuidv4();
    const name = body.name.trim();
    const url = body.url ?? "";
    const assetType = body.asset_type ?? "page";
    const status = body.status ?? "draft";
    const description = body.description ?? "";

    // Determine the next sort_order for assets in this project.
    const maxRow = db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM assets WHERE project_id = ?"
      )
      .get(body.project_id) as { max_order: number };

    const sortOrder = maxRow.max_order + 1;

    db.prepare(
      `INSERT INTO assets (id, project_id, name, description, url, asset_type, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      body.project_id,
      name,
      description,
      url,
      assetType,
      status,
      sortOrder
    );

    // Log activity.
    db.prepare(
      "INSERT INTO activity_log (id, asset_id, project_id, action, details) VALUES (?, ?, ?, ?, ?)"
    ).run(
      uuidv4(),
      id,
      body.project_id,
      "asset_created",
      `Created asset "${name}"`
    );

    const asset = db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(id) as AssetRow;

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/assets]", error);
    return NextResponse.json(
      { error: "Failed to create asset" },
      { status: 500 }
    );
  }
}
