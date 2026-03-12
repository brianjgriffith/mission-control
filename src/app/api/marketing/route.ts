import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/marketing
// Returns all marketing data: cohorts, web classes, leads.
// Optional: ?period=YYYY-MM (filter leads by period)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period");

    const cohorts = db
      .prepare("SELECT * FROM marketing_cohorts ORDER BY start_date DESC")
      .all();

    const webClasses = db
      .prepare("SELECT * FROM marketing_web_classes ORDER BY class_date DESC")
      .all();

    let leads;
    if (period) {
      leads = db
        .prepare("SELECT * FROM marketing_leads WHERE period = ? ORDER BY source")
        .all(period);
    } else {
      leads = db
        .prepare("SELECT * FROM marketing_leads ORDER BY period DESC, source")
        .all();
    }

    return NextResponse.json({ cohorts, webClasses, leads });
  } catch (error) {
    console.error("[GET /api/marketing]", error);
    return NextResponse.json(
      { error: "Failed to fetch marketing data" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/marketing
// Create a new marketing item. Body must include { type: 'cohort' | 'web_class' | 'lead', ...fields }
// ---------------------------------------------------------------------------

interface CreateCohortBody {
  type: "cohort";
  name: string;
  start_date: string;
  end_date: string;
  status?: string;
  enrolled?: number;
  converted_yearly?: number;
  converted_monthly?: number;
  coaching_upsells?: number;
  revenue_cohort?: number;
  revenue_yearly?: number;
  revenue_monthly?: number;
  revenue_coaching?: number;
  notes?: string;
}

interface CreateWebClassBody {
  type: "web_class";
  class_date: string;
  attendees?: number;
  signups_to_cohort?: number;
  notes?: string;
}

interface CreateLeadBody {
  type: "lead";
  source: string;
  count: number;
  period: string;
  notes?: string;
}

type CreateBody = CreateCohortBody | CreateWebClassBody | CreateLeadBody;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBody;
    const db = getDb();

    if (body.type === "cohort") {
      const b = body as CreateCohortBody;
      if (!b.name || !b.start_date || !b.end_date) {
        return NextResponse.json(
          { error: "name, start_date, and end_date are required" },
          { status: 400 }
        );
      }
      const id = uuidv4();
      db.prepare(`
        INSERT INTO marketing_cohorts (id, name, start_date, end_date, status, enrolled,
          converted_yearly, converted_monthly, coaching_upsells,
          revenue_cohort, revenue_yearly, revenue_monthly, revenue_coaching, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, b.name, b.start_date, b.end_date,
        b.status ?? "upcoming", b.enrolled ?? 0,
        b.converted_yearly ?? 0, b.converted_monthly ?? 0, b.coaching_upsells ?? 0,
        b.revenue_cohort ?? 0, b.revenue_yearly ?? 0, b.revenue_monthly ?? 0, b.revenue_coaching ?? 0,
        b.notes ?? ""
      );
      const item = db.prepare("SELECT * FROM marketing_cohorts WHERE id = ?").get(id);
      return NextResponse.json({ item }, { status: 201 });
    }

    if (body.type === "web_class") {
      const b = body as CreateWebClassBody;
      if (!b.class_date) {
        return NextResponse.json(
          { error: "class_date is required" },
          { status: 400 }
        );
      }
      const id = uuidv4();
      db.prepare(`
        INSERT INTO marketing_web_classes (id, class_date, attendees, signups_to_cohort, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, b.class_date, b.attendees ?? 0, b.signups_to_cohort ?? 0, b.notes ?? "");
      const item = db.prepare("SELECT * FROM marketing_web_classes WHERE id = ?").get(id);
      return NextResponse.json({ item }, { status: 201 });
    }

    if (body.type === "lead") {
      const b = body as CreateLeadBody;
      if (!b.source || !b.period || b.count == null) {
        return NextResponse.json(
          { error: "source, period, and count are required" },
          { status: 400 }
        );
      }
      const id = uuidv4();
      db.prepare(`
        INSERT INTO marketing_leads (id, source, count, period, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, b.source, b.count, b.period, b.notes ?? "");
      const item = db.prepare("SELECT * FROM marketing_leads WHERE id = ?").get(id);
      return NextResponse.json({ item }, { status: 201 });
    }

    return NextResponse.json(
      { error: "type must be 'cohort', 'web_class', or 'lead'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[POST /api/marketing]", error);
    return NextResponse.json(
      { error: "Failed to create marketing item" },
      { status: 500 }
    );
  }
}
