import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type FinancialEntryRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/financials
// Returns financial entries. Optional filters: ?project_id, ?entry_type, ?month (YYYY-MM)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");
    const entryType = searchParams.get("entry_type");
    const month = searchParams.get("month");

    const filters: string[] = [];
    const values: unknown[] = [];

    if (projectId) {
      filters.push("project_id = ?");
      values.push(projectId);
    }
    if (entryType) {
      filters.push("entry_type = ?");
      values.push(entryType);
    }
    if (month) {
      filters.push("entry_date LIKE ?");
      values.push(`${month}%`);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const entries = db
      .prepare(
        `SELECT * FROM financial_entries ${where} ORDER BY entry_date DESC, created_at DESC`
      )
      .all(...values) as FinancialEntryRow[];

    // Compute summary
    let totalIncome = 0;
    let totalExpense = 0;
    for (const e of entries) {
      if (e.entry_type === "income") totalIncome += e.amount;
      else totalExpense += e.amount;
    }

    return NextResponse.json({
      entries,
      summary: {
        total_income: totalIncome,
        total_expense: totalExpense,
        net: totalIncome - totalExpense,
      },
    });
  } catch (error) {
    console.error("[GET /api/financials]", error);
    return NextResponse.json(
      { error: "Failed to fetch financial entries" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/financials
// Create a new financial entry.
// ---------------------------------------------------------------------------

interface CreateEntryBody {
  project_id?: string | null;
  entry_type: string;
  amount: number;
  description?: string;
  category?: string;
  entry_date?: string;
  recurring?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateEntryBody;
    const db = getDb();

    if (!body.entry_type || typeof body.amount !== "number") {
      return NextResponse.json(
        { error: "entry_type and amount are required" },
        { status: 400 }
      );
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO financial_entries (id, project_id, entry_type, amount, description, category, entry_date, recurring)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      body.project_id ?? null,
      body.entry_type,
      body.amount,
      body.description ?? "",
      body.category ?? "",
      body.entry_date ?? new Date().toISOString().slice(0, 10),
      body.recurring ? 1 : 0
    );

    const entry = db
      .prepare("SELECT * FROM financial_entries WHERE id = ?")
      .get(id) as FinancialEntryRow;

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/financials]", error);
    return NextResponse.json(
      { error: "Failed to create financial entry" },
      { status: 500 }
    );
  }
}
