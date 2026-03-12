import { NextResponse } from "next/server";
import { getDb, type Category } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/categories
// Returns all categories.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const db = getDb();

    const categories = db
      .prepare("SELECT * FROM categories ORDER BY name ASC")
      .all() as Category[];

    return NextResponse.json({ categories });
  } catch (error) {
    console.error("[GET /api/categories]", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}
