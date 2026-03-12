import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/export
// Dumps all tables as a single JSON object for backup/export.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const db = getDb();

    const cards = db.prepare("SELECT * FROM kanban_cards ORDER BY column_id, sort_order").all();
    const projects = db.prepare("SELECT * FROM projects ORDER BY sort_order").all();
    const assets = db.prepare("SELECT * FROM assets ORDER BY project_id, sort_order").all();
    const asset_links = db.prepare("SELECT * FROM asset_links").all();
    const tooling_metadata = db.prepare("SELECT * FROM tooling_metadata").all();
    const categories = db.prepare("SELECT * FROM categories").all();
    const activity = db.prepare("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 500").all();
    const financials = db.prepare("SELECT * FROM financial_entries ORDER BY entry_date DESC").all();

    const exportData = {
      exported_at: new Date().toISOString(),
      version: "1.0",
      data: {
        cards,
        projects,
        assets,
        asset_links,
        tooling_metadata,
        categories,
        activity,
        financials,
      },
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="mission-control-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/export]", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    );
  }
}
