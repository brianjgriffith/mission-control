import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/financials/deals
// Returns deals with optional filters: ?rep=, ?month=, ?product=
// ---------------------------------------------------------------------------

interface DealRow {
  id: string;
  rep_name: string;
  product: string;
  client_name: string;
  amount: number;
  deal_date: string;
  month: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const rep = searchParams.get("rep");
    const month = searchParams.get("month");
    const product = searchParams.get("product");

    const filters: string[] = [];
    const values: unknown[] = [];

    if (rep) {
      filters.push("rep_name = ?");
      values.push(rep);
    }
    if (month) {
      filters.push("month = ?");
      values.push(month);
    }
    if (product) {
      filters.push("product = ?");
      values.push(product);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const deals = db
      .prepare(`SELECT * FROM deals ${where} ORDER BY deal_date DESC`)
      .all(...values) as DealRow[];

    return NextResponse.json({ deals });
  } catch (error) {
    console.error("[GET /api/financials/deals]", error);
    return NextResponse.json(
      { error: "Failed to fetch deals" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/financials/deals
// Create a new deal record.
// Body: { rep_name, product, client_name, amount, deal_date, notes? }
// ---------------------------------------------------------------------------

interface CreateDealBody {
  rep_name: string;
  product: string;
  client_name: string;
  amount: number;
  deal_date: string;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateDealBody;

    if (!body.rep_name || typeof body.rep_name !== "string") {
      return NextResponse.json({ error: "rep_name is required" }, { status: 400 });
    }
    if (!body.product || typeof body.product !== "string") {
      return NextResponse.json({ error: "product is required" }, { status: 400 });
    }
    if (!body.deal_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.deal_date)) {
      return NextResponse.json({ error: "deal_date must be YYYY-MM-DD" }, { status: 400 });
    }
    if (typeof body.amount !== "number" || isNaN(body.amount)) {
      return NextResponse.json({ error: "amount must be a number" }, { status: 400 });
    }

    const db = getDb();
    const id = uuidv4();
    const month = body.deal_date.slice(0, 7); // YYYY-MM

    db.prepare(
      `INSERT INTO deals (id, rep_name, product, client_name, amount, deal_date, month, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      body.rep_name,
      body.product,
      body.client_name || "",
      body.amount,
      body.deal_date,
      month,
      body.notes ?? ""
    );

    const deal = db.prepare("SELECT * FROM deals WHERE id = ?").get(id) as DealRow;
    return NextResponse.json({ deal }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/financials/deals]", error);
    return NextResponse.json(
      { error: "Failed to create deal" },
      { status: 500 }
    );
  }
}
