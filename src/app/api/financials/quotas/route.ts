import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/financials/quotas
// Returns quota targets. Optional filter: ?rep=Name
// ---------------------------------------------------------------------------

interface QuotaRow {
  id: string;
  rep_name: string;
  month: string;
  target_amount: number;
  created_at: string;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const rep = searchParams.get("rep");

    let quotas: QuotaRow[];
    if (rep) {
      quotas = db
        .prepare("SELECT * FROM rep_quotas WHERE rep_name = ? ORDER BY month ASC")
        .all(rep) as QuotaRow[];
    } else {
      quotas = db
        .prepare("SELECT * FROM rep_quotas ORDER BY month ASC, rep_name ASC")
        .all() as QuotaRow[];
    }

    return NextResponse.json({ quotas });
  } catch (error) {
    console.error("[GET /api/financials/quotas]", error);
    return NextResponse.json(
      { error: "Failed to fetch quotas" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/financials/quotas
// Upsert a quota target. Body: { rep_name, month, target_amount }
// ---------------------------------------------------------------------------

interface CreateQuotaBody {
  rep_name: string;
  month: string;
  target_amount: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateQuotaBody;

    if (!body.rep_name || typeof body.rep_name !== "string") {
      return NextResponse.json({ error: "rep_name is required" }, { status: 400 });
    }
    if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
      return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
    }
    if (typeof body.target_amount !== "number" || isNaN(body.target_amount)) {
      return NextResponse.json({ error: "target_amount must be a number" }, { status: 400 });
    }

    const db = getDb();

    const existing = db
      .prepare("SELECT id FROM rep_quotas WHERE rep_name = ? AND month = ?")
      .get(body.rep_name, body.month) as { id: string } | undefined;

    if (existing) {
      db.prepare(
        "UPDATE rep_quotas SET target_amount = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(body.target_amount, existing.id);

      const quota = db.prepare("SELECT * FROM rep_quotas WHERE id = ?").get(existing.id) as QuotaRow;
      return NextResponse.json({ quota });
    }

    const id = uuidv4();
    db.prepare(
      "INSERT INTO rep_quotas (id, rep_name, month, target_amount) VALUES (?, ?, ?, ?)"
    ).run(id, body.rep_name, body.month, body.target_amount);

    const quota = db.prepare("SELECT * FROM rep_quotas WHERE id = ?").get(id) as QuotaRow;
    return NextResponse.json({ quota }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/financials/quotas]", error);
    return NextResponse.json(
      { error: "Failed to save quota" },
      { status: 500 }
    );
  }
}
