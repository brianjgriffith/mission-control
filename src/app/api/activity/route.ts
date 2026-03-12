import { NextRequest, NextResponse } from "next/server";
import { getDb, type ActivityLogWithCard } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/activity
// Returns the 50 most recent activity log entries with the associated card
// title joined from kanban_cards (if the card still exists).
// Supports optional ?project_id=xxx filter.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");

    let whereClause = "";
    const values: unknown[] = [];

    if (projectId) {
      whereClause = "WHERE a.project_id = ?";
      values.push(projectId);
    }

    const entries = db
      .prepare(
        `SELECT
           a.id,
           a.card_id,
           a.asset_id,
           a.project_id,
           a.action,
           a.details,
           a.created_at,
           c.title AS card_title
         FROM activity_log a
         LEFT JOIN kanban_cards c ON a.card_id = c.id
         ${whereClause}
         ORDER BY a.created_at DESC
         LIMIT 50`
      )
      .all(...values) as ActivityLogWithCard[];

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("[GET /api/activity]", error);
    return NextResponse.json(
      { error: "Failed to fetch activity log" },
      { status: 500 }
    );
  }
}
