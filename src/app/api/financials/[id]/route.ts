import { NextRequest, NextResponse } from "next/server";
import { getDb, type FinancialEntryRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// PATCH /api/financials/[id]
// ---------------------------------------------------------------------------

interface PatchBody {
  project_id?: string | null;
  entry_type?: string;
  amount?: number;
  description?: string;
  category?: string;
  entry_date?: string;
  recurring?: boolean;
}

const ALLOWED_FIELDS = [
  "project_id",
  "entry_type",
  "amount",
  "description",
  "category",
  "entry_date",
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as PatchBody;
    const db = getDb();

    const existing = db
      .prepare("SELECT id FROM financial_entries WHERE id = ?")
      .get(id) as FinancialEntryRow | undefined;

    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        setClauses.push(`${field} = ?`);
        values.push(body[field as keyof PatchBody] ?? null);
      }
    }

    if ("recurring" in body) {
      setClauses.push("recurring = ?");
      values.push(body.recurring ? 1 : 0);
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    setClauses.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(
      `UPDATE financial_entries SET ${setClauses.join(", ")} WHERE id = ?`
    ).run(...values);

    const entry = db
      .prepare("SELECT * FROM financial_entries WHERE id = ?")
      .get(id) as FinancialEntryRow;

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("[PATCH /api/financials/:id]", error);
    return NextResponse.json(
      { error: "Failed to update entry" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/financials/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db
      .prepare("SELECT id FROM financial_entries WHERE id = ?")
      .get(id);

    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    db.prepare("DELETE FROM financial_entries WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/financials/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}
