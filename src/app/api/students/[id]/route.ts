import { NextRequest, NextResponse } from "next/server";
import { getDb, type StudentRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// PATCH /api/students/[id]
// Update any subset of student fields.
// ---------------------------------------------------------------------------

interface PatchStudentBody {
  name?: string;
  email?: string;
  youtube_channel?: string;
  coach?: string;
  program?: string;
  monthly_revenue?: number;
  signup_date?: string;
  status?: string;
  payment_plan?: string;
  renewal_date?: string;
  notes?: string;
  switch_requested_to?: string;
  switch_requested_date?: string;
}

const ALLOWED_FIELDS = [
  "name",
  "email",
  "youtube_channel",
  "coach",
  "program",
  "monthly_revenue",
  "signup_date",
  "status",
  "payment_plan",
  "renewal_date",
  "notes",
  "switch_requested_to",
  "switch_requested_date",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_PROGRAMS = ["elite", "accelerator"];
const VALID_STATUSES = ["active", "cancelled", "paused", "downgraded"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as PatchStudentBody;
    const db = getDb();

    const existing = db
      .prepare("SELECT * FROM students WHERE id = ?")
      .get(id) as StudentRow | undefined;

    if (!existing) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    // Validate specific fields if provided
    if (body.name !== undefined && (!body.name || !body.name.trim())) {
      return NextResponse.json(
        { error: "name cannot be empty" },
        { status: 400 }
      );
    }

    if (body.program !== undefined && !VALID_PROGRAMS.includes(body.program)) {
      return NextResponse.json(
        { error: "program must be 'elite' or 'accelerator'" },
        { status: 400 }
      );
    }

    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: "status must be 'active', 'cancelled', 'paused', or 'downgraded'" },
        { status: 400 }
      );
    }

    if (body.signup_date !== undefined && !DATE_RE.test(body.signup_date)) {
      return NextResponse.json(
        { error: "signup_date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    if (
      body.monthly_revenue !== undefined &&
      typeof body.monthly_revenue !== "number"
    ) {
      return NextResponse.json(
        { error: "monthly_revenue must be a number" },
        { status: 400 }
      );
    }

    // Check which columns actually exist (defensive against missing migrations)
    const tableCols = new Set(
      (db.prepare("PRAGMA table_info(students)").all() as { name: string }[]).map((c) => c.name)
    );

    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (field in body && tableCols.has(field)) {
        setClauses.push(`${field} = ?`);
        const raw = body[field as keyof PatchStudentBody];
        if (field === "name" && typeof raw === "string") {
          values.push(raw.trim());
        } else {
          values.push(raw ?? "");
        }
      }
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
      `UPDATE students SET ${setClauses.join(", ")} WHERE id = ?`
    ).run(...values);

    const student = db
      .prepare("SELECT * FROM students WHERE id = ?")
      .get(id) as StudentRow;

    return NextResponse.json({ student });
  } catch (error) {
    console.error("[PATCH /api/students/:id]", error);
    const message = error instanceof Error ? error.message : "Failed to update student";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/students/[id]
// Remove student and related churn_events and elite_attendance records.
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db
      .prepare("SELECT id FROM students WHERE id = ?")
      .get(id);

    if (!existing) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    db.transaction(() => {
      db.prepare("DELETE FROM churn_events WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM elite_attendance WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM students WHERE id = ?").run(id);
    })();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/students/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete student" },
      { status: 500 }
    );
  }
}
