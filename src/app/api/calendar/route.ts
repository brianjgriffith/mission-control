import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type CalendarEventRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/calendar
// Returns calendar events within a date range.
// Required: ?start=YYYY-MM-DD&end=YYYY-MM-DD
// Optional: ?event_type=xxx
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const eventType = searchParams.get("event_type");

    if (!start || !end) {
      return NextResponse.json(
        { error: "start and end query parameters are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
      return NextResponse.json(
        { error: "start and end must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    const filters: string[] = [
      "start_date <= ?",
      "(end_date >= ? OR (end_date IS NULL AND start_date >= ?))",
    ];
    const values: unknown[] = [end, start, start];

    if (eventType) {
      filters.push("event_type = ?");
      values.push(eventType);
    }

    const where = `WHERE ${filters.join(" AND ")}`;

    const events = db
      .prepare(
        `SELECT * FROM calendar_events ${where} ORDER BY start_date ASC`
      )
      .all(...values) as CalendarEventRow[];

    return NextResponse.json({ events });
  } catch (error) {
    console.error("[GET /api/calendar]", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar events" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/calendar
// Create a new calendar event.
// ---------------------------------------------------------------------------

interface CreateEventBody {
  title: string;
  start_date: string;
  end_date?: string | null;
  event_type?: string;
  color?: string;
  description?: string;
  project_id?: string | null;
  all_day?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateEventBody;
    const db = getDb();

    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    if (!body.start_date || !DATE_RE.test(body.start_date)) {
      return NextResponse.json(
        { error: "start_date is required and must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    if (body.end_date) {
      if (!DATE_RE.test(body.end_date)) {
        return NextResponse.json(
          { error: "end_date must be in YYYY-MM-DD format" },
          { status: 400 }
        );
      }
      if (body.end_date < body.start_date) {
        return NextResponse.json(
          { error: "end_date must be >= start_date" },
          { status: 400 }
        );
      }
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO calendar_events (id, title, description, start_date, end_date, event_type, color, all_day, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      body.title.trim(),
      body.description ?? "",
      body.start_date,
      body.end_date ?? null,
      body.event_type ?? "custom",
      body.color ?? "",
      body.all_day === false ? 0 : 1,
      body.project_id ?? null
    );

    const event = db
      .prepare("SELECT * FROM calendar_events WHERE id = ?")
      .get(id) as CalendarEventRow;

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/calendar]", error);
    return NextResponse.json(
      { error: "Failed to create calendar event" },
      { status: 500 }
    );
  }
}
