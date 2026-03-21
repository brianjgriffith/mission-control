import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// DEPRECATED: assets table no longer exists in Supabase.
// Returns empty arrays/objects to keep the frontend from crashing.
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({ assets: [] });
}

export async function POST() {
  return NextResponse.json({ error: "Assets API is deprecated" }, { status: 410 });
}
