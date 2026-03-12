import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type RepSaleRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/financials/sales
// Returns rep sales data. Optional filters: ?rep=Name, ?product=elite
// Includes unique rep names and product names (unfiltered) for UI dropdowns.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const rep = searchParams.get("rep");
    const product = searchParams.get("product");

    const filters: string[] = [];
    const values: unknown[] = [];

    if (rep) {
      filters.push("rep_name = ?");
      values.push(rep);
    }
    if (product) {
      filters.push("product = ?");
      values.push(product);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const sales = db
      .prepare(
        `SELECT * FROM rep_sales ${where} ORDER BY month ASC, rep_name ASC`
      )
      .all(...values) as RepSaleRow[];

    // Distinct rep names (unfiltered)
    const reps = db
      .prepare("SELECT DISTINCT rep_name FROM rep_sales ORDER BY rep_name")
      .all() as { rep_name: string }[];

    // Distinct products (unfiltered)
    const products = db
      .prepare("SELECT DISTINCT product FROM rep_sales ORDER BY product")
      .all() as { product: string }[];

    return NextResponse.json({
      sales,
      reps: reps.map((r) => r.rep_name),
      products: products.map((p) => p.product),
    });
  } catch (error) {
    console.error("[GET /api/financials/sales]", error);
    return NextResponse.json(
      { error: "Failed to fetch rep sales" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/financials/sales
// Create or update (upsert) a rep sale record.
// Body: { rep_name, month, product, amount, deal_count?, notes? }
// ---------------------------------------------------------------------------

interface CreateBody {
  rep_name: string;
  month: string;
  product: string;
  amount: number;
  new_amount?: number;
  recurring_amount?: number;
  deal_count?: number;
  booked_calls?: number;
  refund_amount?: number;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBody;

    if (!body.rep_name || typeof body.rep_name !== "string") {
      return NextResponse.json(
        { error: "rep_name is required" },
        { status: 400 }
      );
    }
    if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
      return NextResponse.json(
        { error: "month must be in YYYY-MM format" },
        { status: 400 }
      );
    }
    if (!body.product || typeof body.product !== "string") {
      return NextResponse.json(
        { error: "product is required" },
        { status: 400 }
      );
    }
    if (typeof body.amount !== "number" || isNaN(body.amount)) {
      return NextResponse.json(
        { error: "amount must be a number" },
        { status: 400 }
      );
    }

    // Auto-compute amount from sub-fields when they're provided
    const hasSubFields = body.new_amount !== undefined || body.recurring_amount !== undefined || body.refund_amount !== undefined;
    const computedAmount = (body.new_amount ?? 0) + (body.recurring_amount ?? 0) - (body.refund_amount ?? 0);
    const finalAmount = hasSubFields ? computedAmount : body.amount;

    const db = getDb();

    // Check if a record already exists for this rep + month + product
    const existing = db
      .prepare(
        "SELECT id FROM rep_sales WHERE rep_name = ? AND month = ? AND product = ?"
      )
      .get(body.rep_name, body.month, body.product) as
      | { id: string }
      | undefined;

    if (existing) {
      // Update existing
      db.prepare(
        `UPDATE rep_sales
         SET amount = ?, new_amount = ?, recurring_amount = ?, deal_count = ?, booked_calls = ?, refund_amount = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        finalAmount,
        body.new_amount ?? 0,
        body.recurring_amount ?? 0,
        body.deal_count ?? 0,
        body.booked_calls ?? 0,
        body.refund_amount ?? 0,
        body.notes ?? "",
        existing.id
      );

      const sale = db
        .prepare("SELECT * FROM rep_sales WHERE id = ?")
        .get(existing.id) as RepSaleRow;

      return NextResponse.json({ sale });
    }

    // Create new
    const id = uuidv4();
    db.prepare(
      `INSERT INTO rep_sales (id, rep_name, month, product, amount, new_amount, recurring_amount, deal_count, booked_calls, refund_amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      body.rep_name,
      body.month,
      body.product,
      finalAmount,
      body.new_amount ?? 0,
      body.recurring_amount ?? 0,
      body.deal_count ?? 0,
      body.booked_calls ?? 0,
      body.refund_amount ?? 0,
      body.notes ?? ""
    );

    const sale = db
      .prepare("SELECT * FROM rep_sales WHERE id = ?")
      .get(id) as RepSaleRow;

    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/financials/sales]", error);
    return NextResponse.json(
      { error: "Failed to save rep sale" },
      { status: 500 }
    );
  }
}
