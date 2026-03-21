import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// DEPRECATED: categories table no longer exists in Supabase.
// Returns an empty array to keep the frontend from crashing.
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({ categories: [] });
}
