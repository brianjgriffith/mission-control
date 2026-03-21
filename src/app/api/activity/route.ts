import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// GET /api/activity
// DEPRECATED: activity_log table no longer exists in Supabase.
// Returns an empty array to keep the dashboard from crashing.
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({ entries: [] });
}
