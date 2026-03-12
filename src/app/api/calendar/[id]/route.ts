import { NextRequest, NextResponse } from "next/server";
import { getDb, type CalendarEventRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// PATCH /api/calendar/[id]
// ---------------------------------------------------------------------------

interface PatchBody {
  title?: string;
  description?: string;
  start_date?: string;
  end_date?: string | null;
  event_type?: string;
  color?: string;
  all_day?: boolean;
  project_id?: string | null;
}

const ALLOWED_FIELDS = [
  "title",
  "description",
  "start_date",
  "end_date",
  "event_type",
  "color",
  "project_id",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as PatchBody;
    const db = getDb();

    const existing = db
      .prepare("SELECT * FROM calendar_events WHERE id = ?")
      .get(id) as CalendarEventRow | undefined;

    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Validate date fields if provided
    if (body.start_date !== undefined && !DATE_RE.test(body.start_date)) {
      return NextResponse.json(
        { error: "start_date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    if (body.end_date !== undefined && body.end_date !== null && !DATE_RE.test(body.end_date)) {
      return NextResponse.json(
        { error: "end_date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    // Cross-validate: end_date >= start_date
    const effectiveStart = body.start_date ?? existing.start_date;
    const effectiveEnd = body.end_date !== undefined ? body.end_date : existing.end_date;
    if (effectiveEnd !== null && effectiveEnd < effectiveStart) {
      return NextResponse.json(
        { error: "end_date must be >= start_date" },
        { status: 400 }
      );
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        setClauses.push(`${field} = ?`);
        values.push(body[field as keyof PatchBody] ?? null);
      }
    }

    if ("all_day" in body) {
      setClauses.push("all_day = ?");
      values.push(body.all_day ? 1 : 0);
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
      `UPDATE calendar_events SET ${setClauses.join(", ")} WHERE id = ?`
    ).run(...values);

    const event = db
      .prepare("SELECT * FROM calendar_events WHERE id = ?")
      .get(id) as CalendarEventRow;

    return NextResponse.json({ event });
  } catch (error) {
    console.error("[PATCH /api/calendar/:id]", error);
    return NextResponse.json(
      { error: "Failed to update event" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/calendar/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db
      .prepare("SELECT id FROM calendar_events WHERE id = ?")
      .get(id);

    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    db.prepare("DELETE FROM calendar_events WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/calendar/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete event" },
      { status: 500 }
    );
  }
}
