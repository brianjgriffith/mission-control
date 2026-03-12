import { NextResponse } from "next/server";
import { getDb, type AssetRow, type ToolingMetadataRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/tooling
// Returns all assets whose parent project has project_type='tooling',
// joined with their tooling_metadata (if any) and the project name.
// ---------------------------------------------------------------------------

interface ToolingAsset extends AssetRow {
  metadata: ToolingMetadataRow | null;
  project_name: string;
}

export async function GET() {
  try {
    const db = getDb();

    // Fetch all assets belonging to tooling-type projects.
    const rows = db
      .prepare(
        `SELECT
           a.*,
           p.name AS project_name,
           tm.id            AS tm_id,
           tm.asset_id      AS tm_asset_id,
           tm.repo_path     AS tm_repo_path,
           tm.usage_frequency AS tm_usage_frequency,
           tm.last_used_at  AS tm_last_used_at,
           tm.optimization_notes AS tm_optimization_notes,
           tm.dependencies  AS tm_dependencies,
           tm.created_at    AS tm_created_at,
           tm.updated_at    AS tm_updated_at
         FROM assets a
         INNER JOIN projects p ON a.project_id = p.id
         LEFT JOIN tooling_metadata tm ON tm.asset_id = a.id
         WHERE p.project_type = 'tooling'
         ORDER BY a.sort_order ASC`
      )
      .all() as Record<string, unknown>[];

    const assets: ToolingAsset[] = rows.map((row) => {
      const metadata: ToolingMetadataRow | null = row.tm_id
        ? {
            id: row.tm_id as string,
            asset_id: row.tm_asset_id as string,
            repo_path: row.tm_repo_path as string,
            usage_frequency: row.tm_usage_frequency as string,
            last_used_at: (row.tm_last_used_at as string | null),
            optimization_notes: row.tm_optimization_notes as string,
            dependencies: row.tm_dependencies as string,
            created_at: row.tm_created_at as string,
            updated_at: row.tm_updated_at as string,
          }
        : null;

      return {
        id: row.id as string,
        project_id: row.project_id as string,
        name: row.name as string,
        description: row.description as string,
        url: row.url as string,
        asset_type: row.asset_type as string,
        status: row.status as string,
        performance_notes: row.performance_notes as string,
        screenshot_url: row.screenshot_url as string,
        sort_order: row.sort_order as number,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        project_name: row.project_name as string,
        metadata,
      };
    });

    return NextResponse.json({ assets });
  } catch (error) {
    console.error("[GET /api/tooling]", error);
    return NextResponse.json(
      { error: "Failed to fetch tooling assets" },
      { status: 500 }
    );
  }
}
