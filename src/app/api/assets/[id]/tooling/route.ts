import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type AssetRow, type ToolingMetadataRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// PUT /api/assets/[id]/tooling
// Create or update (upsert) tooling metadata for an asset.
// Body: { repo_path?, usage_frequency?, optimization_notes?,
//         dependencies?, last_used_at? }
// dependencies is a string array, stored as JSON.
// ---------------------------------------------------------------------------

interface ToolingBody {
  repo_path?: string;
  usage_frequency?: string;
  optimization_notes?: string;
  dependencies?: string[];
  last_used_at?: string | null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assetId } = await params;
    const body = (await request.json()) as ToolingBody;
    const db = getDb();

    // Verify the asset exists.
    const asset = db
      .prepare("SELECT id FROM assets WHERE id = ?")
      .get(assetId) as AssetRow | undefined;

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const repoPath = body.repo_path ?? "";
    const usageFrequency = body.usage_frequency ?? "unknown";
    const optimizationNotes = body.optimization_notes ?? "";
    const dependencies = JSON.stringify(body.dependencies ?? []);
    const lastUsedAt = body.last_used_at ?? null;

    // Check for existing metadata to preserve the original id.
    const existing = db
      .prepare("SELECT id FROM tooling_metadata WHERE asset_id = ?")
      .get(assetId) as { id: string } | undefined;

    const metadataId = existing?.id ?? uuidv4();

    // Upsert: INSERT OR REPLACE keyed on the UNIQUE asset_id constraint.
    db.prepare(
      `INSERT OR REPLACE INTO tooling_metadata
         (id, asset_id, repo_path, usage_frequency, last_used_at, optimization_notes, dependencies, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?,
         COALESCE((SELECT created_at FROM tooling_metadata WHERE asset_id = ?), datetime('now')),
         datetime('now'))`
    ).run(
      metadataId,
      assetId,
      repoPath,
      usageFrequency,
      lastUsedAt,
      optimizationNotes,
      dependencies,
      assetId
    );

    const metadata = db
      .prepare("SELECT * FROM tooling_metadata WHERE asset_id = ?")
      .get(assetId) as ToolingMetadataRow;

    return NextResponse.json({ metadata });
  } catch (error) {
    console.error("[PUT /api/assets/:id/tooling]", error);
    return NextResponse.json(
      { error: "Failed to save tooling metadata" },
      { status: 500 }
    );
  }
}
