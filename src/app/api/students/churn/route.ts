import { NextRequest, NextResponse } from "next/server";
import { getDb, type ChurnEventRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/students/churn
// Returns churn events joined with student name.
// Optional filters: ?month (YYYY-MM), ?event_type, ?coach
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const eventType = searchParams.get("event_type");
    const coach = searchParams.get("coach");
    const studentId = searchParams.get("student_id");

    const filters: string[] = [];
    const values: unknown[] = [];

    if (month) {
      filters.push("c.event_date LIKE ?");
      values.push(`${month}%`);
    }
    if (eventType) {
      filters.push("c.event_type = ?");
      values.push(eventType);
    }
    if (coach) {
      filters.push("c.coach = ?");
      values.push(coach);
    }
    if (studentId) {
      filters.push("c.student_id = ?");
      values.push(studentId);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const events = db
      .prepare(
        `SELECT c.*, s.name AS student_name
         FROM churn_events c
         LEFT JOIN students s ON s.id = c.student_id
         ${where}
         ORDER BY c.event_date DESC`
      )
      .all(...values) as (ChurnEventRow & { student_name: string })[];

    return NextResponse.json({ events });
  } catch (error) {
    console.error("[GET /api/students/churn]", error);
    return NextResponse.json(
      { error: "Failed to fetch churn events" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/students/churn
// Create a churn event and update the student's status accordingly.
// Body: { student_id, event_type, event_date, reason?, monthly_revenue_impact, coach?, notes? }
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_EVENT_TYPES = ["cancel", "downgrade", "pause", "restart"];
const EVENT_TYPE_TO_STATUS: Record<string, string> = {
  cancel: "cancelled",
  downgrade: "downgraded",
  pause: "paused",
  restart: "active",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();

    if (!body.student_id || typeof body.student_id !== "string") {
      return NextResponse.json(
        { error: "student_id is required" },
        { status: 400 }
      );
    }

    if (!body.event_type || !VALID_EVENT_TYPES.includes(body.event_type)) {
      return NextResponse.json(
        { error: "event_type is required and must be 'cancel', 'downgrade', 'pause', or 'restart'" },
        { status: 400 }
      );
    }

    if (!body.event_date || !DATE_RE.test(body.event_date)) {
      return NextResponse.json(
        { error: "event_date is required and must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    if (typeof body.monthly_revenue_impact !== "number") {
      return NextResponse.json(
        { error: "monthly_revenue_impact is required and must be a number" },
        { status: 400 }
      );
    }

    // Verify student exists
    const student = db
      .prepare("SELECT id FROM students WHERE id = ?")
      .get(body.student_id);

    if (!student) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    const id = crypto.randomUUID();

    db.transaction(() => {
      db.prepare(
        `INSERT INTO churn_events (id, student_id, event_type, event_date, reason, monthly_revenue_impact, coach, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        body.student_id,
        body.event_type,
        body.event_date,
        body.reason ?? "",
        body.monthly_revenue_impact,
        body.coach ?? "",
        body.notes ?? ""
      );

      const newStatus = EVENT_TYPE_TO_STATUS[body.event_type];
      db.prepare(
        "UPDATE students SET status = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newStatus, body.student_id);
    })();

    const event = db
      .prepare("SELECT * FROM churn_events WHERE id = ?")
      .get(id) as ChurnEventRow;

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/students/churn]", error);
    return NextResponse.json(
      { error: "Failed to create churn event" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/students/churn?id=<event_id>
// Delete a churn event by ID and revert the student's status to "active".
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const existing = db
      .prepare("SELECT * FROM churn_events WHERE id = ?")
      .get(id) as ChurnEventRow | undefined;

    if (!existing) {
      return NextResponse.json(
        { error: "Churn event not found" },
        { status: 404 }
      );
    }

    db.transaction(() => {
      db.prepare("DELETE FROM churn_events WHERE id = ?").run(id);

      // Revert the student's status to active
      db.prepare(
        "UPDATE students SET status = 'active', updated_at = datetime('now') WHERE id = ?"
      ).run(existing.student_id);
    })();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/students/churn]", error);
    return NextResponse.json(
      { error: "Failed to delete churn event" },
      { status: 500 }
    );
  }
}
