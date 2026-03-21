import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// DEPRECATED: kanban_cards table no longer exists in Supabase.
// Returns empty arrays/objects to keep the frontend from crashing.
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({ cards: [] });
}

export async function POST() {
  return NextResponse.json({ error: "Cards API is deprecated" }, { status: 410 });
}
