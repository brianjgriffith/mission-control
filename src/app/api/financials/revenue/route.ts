import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type RevenueSnapshotRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/financials/revenue
// Returns revenue snapshots. Optional filters: ?product=xxx, ?year=2025
// Includes computed summaries per product.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const product = searchParams.get("product");
    const year = searchParams.get("year");

    const filters: string[] = [];
    const values: unknown[] = [];

    if (product) {
      filters.push("product_name = ?");
      values.push(product);
    }
    if (year) {
      filters.push("month LIKE ?");
      values.push(`${year}-%`);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const snapshots = db
      .prepare(
        `SELECT * FROM revenue_snapshots ${where} ORDER BY month DESC, product_name ASC`
      )
      .all(...values) as RevenueSnapshotRow[];

    // Compute per-product summaries
    const productTotals: Record<
      string,
      { total: number; count: number; best: number; bestMonth: string }
    > = {};
    let grandTotal = 0;

    for (const s of snapshots) {
      if (!productTotals[s.product_name]) {
        productTotals[s.product_name] = {
          total: 0,
          count: 0,
          best: 0,
          bestMonth: "",
        };
      }
      const pt = productTotals[s.product_name];
      pt.total += s.amount;
      pt.count += 1;
      if (s.amount > pt.best) {
        pt.best = s.amount;
        pt.bestMonth = s.month;
      }
      grandTotal += s.amount;
    }

    // Distinct products
    const products = db
      .prepare("SELECT DISTINCT product_name FROM revenue_snapshots ORDER BY product_name")
      .all() as { product_name: string }[];

    return NextResponse.json({
      snapshots,
      products: products.map((p) => p.product_name),
      summary: {
        grand_total: grandTotal,
        product_totals: productTotals,
      },
    });
  } catch (error) {
    console.error("[GET /api/financials/revenue]", error);
    return NextResponse.json(
      { error: "Failed to fetch revenue snapshots" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/financials/revenue
// Create or update (upsert) a revenue snapshot.
// Body: { product_name, month, amount, notes? }
// ---------------------------------------------------------------------------

interface CreateBody {
  product_name: string;
  month: string;
  amount: number;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBody;

    if (!body.product_name || typeof body.product_name !== "string") {
      return NextResponse.json(
        { error: "product_name is required" },
        { status: 400 }
      );
    }
    if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
      return NextResponse.json(
        { error: "month must be in YYYY-MM format" },
        { status: 400 }
      );
    }
    if (typeof body.amount !== "number" || body.amount < 0) {
      return NextResponse.json(
        { error: "amount must be a non-negative number" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if a snapshot already exists for this product + month
    const existing = db
      .prepare(
        "SELECT id FROM revenue_snapshots WHERE product_name = ? AND month = ?"
      )
      .get(body.product_name, body.month) as { id: string } | undefined;

    if (existing) {
      // Update existing
      db.prepare(
        `UPDATE revenue_snapshots
         SET amount = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(body.amount, body.notes ?? "", existing.id);

      const snapshot = db
        .prepare("SELECT * FROM revenue_snapshots WHERE id = ?")
        .get(existing.id) as RevenueSnapshotRow;

      return NextResponse.json({ snapshot });
    }

    // Create new
    const id = uuidv4();
    db.prepare(
      `INSERT INTO revenue_snapshots (id, product_name, month, amount, notes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, body.product_name, body.month, body.amount, body.notes ?? "");

    const snapshot = db
      .prepare("SELECT * FROM revenue_snapshots WHERE id = ?")
      .get(id) as RevenueSnapshotRow;

    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/financials/revenue]", error);
    return NextResponse.json(
      { error: "Failed to save revenue snapshot" },
      { status: 500 }
    );
  }
}
