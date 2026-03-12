import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// PATCH /api/marketing/:id
// Update a cohort, web class, or lead by ID.
// Body must include { table: 'cohort' | 'web_class' | 'lead', ...fields }
// ---------------------------------------------------------------------------

const TABLE_MAP: Record<string, string> = {
  cohort: "marketing_cohorts",
  web_class: "marketing_web_classes",
  lead: "marketing_leads",
};

const ALLOWED_FIELDS: Record<string, string[]> = {
  cohort: [
    "name", "start_date", "end_date", "status", "enrolled",
    "converted_yearly", "converted_monthly", "coaching_upsells",
    "revenue_cohort", "revenue_yearly", "revenue_monthly", "revenue_coaching", "notes",
  ],
  web_class: ["class_date", "attendees", "signups_to_cohort", "notes"],
  lead: ["source", "count", "period", "notes"],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = getDb();

    const table = body.table as string;
    if (!table || !TABLE_MAP[table]) {
      return NextResponse.json(
        { error: "table must be 'cohort', 'web_class', or 'lead'" },
        { status: 400 }
      );
    }

    const tableName = TABLE_MAP[table];
    const allowed = ALLOWED_FIELDS[table];
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const field of allowed) {
      if (field in body) {
        sets.push(`${field} = ?`);
        values.push(body[field]);
      }
    }

    if (sets.length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Add updated_at if the table has it
    if (table !== "lead") {
      sets.push("updated_at = datetime('now')");
    }

    values.push(id);
    db.prepare(`UPDATE ${tableName} SET ${sets.join(", ")} WHERE id = ?`).run(
      ...values
    );

    const item = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("[PATCH /api/marketing/:id]", error);
    return NextResponse.json(
      { error: "Failed to update marketing item" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/marketing/:id
// Delete a marketing item. Query param: ?table=cohort|web_class|lead
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table");

    if (!table || !TABLE_MAP[table]) {
      return NextResponse.json(
        { error: "table query param must be 'cohort', 'web_class', or 'lead'" },
        { status: 400 }
      );
    }

    const tableName = TABLE_MAP[table];
    const result = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id);

    if (result.changes === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/marketing/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete marketing item" },
      { status: 500 }
    );
  }
}
