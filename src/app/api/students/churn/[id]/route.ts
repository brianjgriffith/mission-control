import { NextRequest, NextResponse } from "next/server";
import { getDb, type ChurnEventRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// PATCH /api/students/churn/[id]
// Update churn event fields.
// ---------------------------------------------------------------------------

interface PatchChurnBody {
  event_type?: string;
  event_date?: string;
  reason?: string;
  monthly_revenue_impact?: number;
  coach?: string;
  notes?: string;
}

const ALLOWED_FIELDS = [
  "event_type",
  "event_date",
  "reason",
  "monthly_revenue_impact",
  "coach",
  "notes",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_EVENT_TYPES = ["cancel", "downgrade", "pause", "restart"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as PatchChurnBody;
    const db = getDb();

    const existing = db
      .prepare("SELECT * FROM churn_events WHERE id = ?")
      .get(id) as ChurnEventRow | undefined;

    if (!existing) {
      return NextResponse.json(
        { error: "Churn event not found" },
        { status: 404 }
      );
    }

    // Validate specific fields if provided
    if (
      body.event_type !== undefined &&
      !VALID_EVENT_TYPES.includes(body.event_type)
    ) {
      return NextResponse.json(
        { error: "event_type must be 'cancel', 'downgrade', 'pause', or 'restart'" },
        { status: 400 }
      );
    }

    if (body.event_date !== undefined && !DATE_RE.test(body.event_date)) {
      return NextResponse.json(
        { error: "event_date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        setClauses.push(`${field} = ?`);
        values.push(body[field as keyof PatchChurnBody] ?? "");
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    values.push(id);

    db.prepare(
      `UPDATE churn_events SET ${setClauses.join(", ")} WHERE id = ?`
    ).run(...values);

    // If event_type changed, update student status accordingly
    if (body.event_type !== undefined && body.event_type !== existing.event_type) {
      const EVENT_TYPE_TO_STATUS: Record<string, string> = {
        cancel: "cancelled",
        downgrade: "downgraded",
        pause: "paused",
        restart: "active",
      };
      const newStatus = EVENT_TYPE_TO_STATUS[body.event_type];
      if (newStatus) {
        db.prepare(
          "UPDATE students SET status = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(newStatus, existing.student_id);
      }
    }

    const event = db
      .prepare(
        `SELECT c.*, s.name AS student_name
         FROM churn_events c
         LEFT JOIN students s ON s.id = c.student_id
         WHERE c.id = ?`
      )
      .get(id) as ChurnEventRow & { student_name: string };

    return NextResponse.json({ event });
  } catch (error) {
    console.error("[PATCH /api/students/churn/:id]", error);
    return NextResponse.json(
      { error: "Failed to update churn event" },
      { status: 500 }
    );
  }
}
