import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// DEPRECATED: financial_entries table no longer exists in Supabase.
// Returns empty data to keep the frontend from crashing.
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({
    entries: [],
    summary: {
      total_income: 0,
      total_expense: 0,
      net: 0,
    },
  });
}

export async function POST() {
  return NextResponse.json({ error: "Financials API is deprecated" }, { status: 410 });
}
