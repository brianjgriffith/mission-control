import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type BudgetTargetRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/financials/budget
// Returns budget targets. Optional filter: ?month=YYYY-MM for a single month.
// Without a month param, returns all targets ordered by month DESC.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    if (month) {
      // Validate format
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return NextResponse.json(
          { error: "month must be in YYYY-MM format" },
          { status: 400 }
        );
      }

      const target = db
        .prepare("SELECT * FROM budget_targets WHERE month = ?")
        .get(month) as BudgetTargetRow | undefined;

      return NextResponse.json({ target: target ?? null });
    }

    // Return all targets
    const targets = db
      .prepare("SELECT * FROM budget_targets ORDER BY month DESC")
      .all() as BudgetTargetRow[];

    return NextResponse.json({ targets });
  } catch (error) {
    console.error("[GET /api/financials/budget]", error);
    return NextResponse.json(
      { error: "Failed to fetch budget targets" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/financials/budget
// Create or update (upsert) a budget target for a given month.
// Body: { month, target_income?, target_expense?, notes? }
// ---------------------------------------------------------------------------

interface CreateBody {
  month: string;
  target_income?: number;
  target_expense?: number;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBody;

    if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
      return NextResponse.json(
        { error: "month must be in YYYY-MM format" },
        { status: 400 }
      );
    }

    const targetIncome = body.target_income ?? 0;
    const targetExpense = body.target_expense ?? 0;
    const notes = body.notes ?? "";

    if (typeof targetIncome !== "number" || targetIncome < 0) {
      return NextResponse.json(
        { error: "target_income must be a non-negative number" },
        { status: 400 }
      );
    }
    if (typeof targetExpense !== "number" || targetExpense < 0) {
      return NextResponse.json(
        { error: "target_expense must be a non-negative number" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if a target already exists for this month
    const existing = db
      .prepare("SELECT id FROM budget_targets WHERE month = ?")
      .get(body.month) as { id: string } | undefined;

    if (existing) {
      // Update existing
      db.prepare(
        `UPDATE budget_targets
         SET target_income = ?, target_expense = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(targetIncome, targetExpense, notes, existing.id);

      const target = db
        .prepare("SELECT * FROM budget_targets WHERE id = ?")
        .get(existing.id) as BudgetTargetRow;

      return NextResponse.json({ target });
    }

    // Create new
    const id = uuidv4();
    db.prepare(
      `INSERT INTO budget_targets (id, month, target_income, target_expense, notes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, body.month, targetIncome, targetExpense, notes);

    const target = db
      .prepare("SELECT * FROM budget_targets WHERE id = ?")
      .get(id) as BudgetTargetRow;

    return NextResponse.json({ target }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/financials/budget]", error);
    return NextResponse.json(
      { error: "Failed to save budget target" },
      { status: 500 }
    );
  }
}
