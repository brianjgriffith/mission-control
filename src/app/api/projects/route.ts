import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// DEPRECATED: projects table no longer exists in Supabase.
// Returns empty arrays/objects to keep the frontend from crashing.
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({ projects: [] });
}

export async function POST() {
  return NextResponse.json({ error: "Projects API is deprecated" }, { status: 410 });
}
