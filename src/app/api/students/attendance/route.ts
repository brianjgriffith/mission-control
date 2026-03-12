import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type EliteAttendanceRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/students/attendance
// Returns attendance for a session plus all active elite students not yet
// in the attendance table (so the UI can render a complete checklist).
// Required: ?session_id=xxx
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");
    const studentId = searchParams.get("student_id");

    // Student mode: return all sessions the student attended
    if (studentId) {
      const sessions = db
        .prepare(
          `SELECT es.id, es.title, es.session_type, es.session_date, ea.attended
           FROM elite_attendance ea
           JOIN elite_sessions es ON es.id = ea.session_id
           WHERE ea.student_id = ? AND ea.attended = 1
           ORDER BY es.session_date DESC`
        )
        .all(studentId) as { id: string; title: string; session_type: string; session_date: string; attended: number }[];

      return NextResponse.json({ sessions });
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: "session_id or student_id query parameter is required" },
        { status: 400 }
      );
    }

    // Verify session exists
    const session = db
      .prepare("SELECT id FROM elite_sessions WHERE id = ?")
      .get(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Get existing attendance records joined with student names
    const existing = db
      .prepare(
        `SELECT ea.*, s.name AS student_name
         FROM elite_attendance ea
         JOIN students s ON s.id = ea.student_id
         WHERE ea.session_id = ?
         ORDER BY s.name ASC`
      )
      .all(sessionId) as (EliteAttendanceRow & { student_name: string })[];

    // Get active elite students who do NOT have an attendance record yet
    const attendedStudentIds = existing.map((r) => r.student_id);

    let missing: { id: string; name: string }[] = [];
    if (attendedStudentIds.length > 0) {
      const placeholders = attendedStudentIds.map(() => "?").join(", ");
      missing = db
        .prepare(
          `SELECT id, name FROM students
           WHERE program = 'elite' AND status = 'active'
           AND id NOT IN (${placeholders})
           ORDER BY name ASC`
        )
        .all(...attendedStudentIds) as { id: string; name: string }[];
    } else {
      missing = db
        .prepare(
          `SELECT id, name FROM students
           WHERE program = 'elite' AND status = 'active'
           ORDER BY name ASC`
        )
        .all() as { id: string; name: string }[];
    }

    // Build placeholder records for missing students
    const missingRecords = missing.map((s) => ({
      id: null as string | null,
      session_id: sessionId,
      student_id: s.id,
      attended: 0,
      notes: "",
      created_at: "",
      student_name: s.name,
    }));

    const attendance = [
      ...existing,
      ...missingRecords,
    ].sort((a, b) => a.student_name.localeCompare(b.student_name));

    return NextResponse.json({ attendance });
  } catch (error) {
    console.error("[GET /api/students/attendance]", error);
    return NextResponse.json(
      { error: "Failed to fetch attendance" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/students/attendance
// Upsert attendance record using INSERT OR REPLACE on UNIQUE(session_id, student_id).
// ---------------------------------------------------------------------------

interface UpsertAttendanceBody {
  session_id: string;
  student_id: string;
  attended: boolean | number;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UpsertAttendanceBody;
    const db = getDb();

    if (!body.session_id || typeof body.session_id !== "string") {
      return NextResponse.json(
        { error: "session_id is required" },
        { status: 400 }
      );
    }

    if (!body.student_id || typeof body.student_id !== "string") {
      return NextResponse.json(
        { error: "student_id is required" },
        { status: 400 }
      );
    }

    if (body.attended === undefined || body.attended === null) {
      return NextResponse.json(
        { error: "attended is required" },
        { status: 400 }
      );
    }

    // Verify session exists
    const session = db
      .prepare("SELECT id FROM elite_sessions WHERE id = ?")
      .get(body.session_id);

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
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

    const attendedInt = body.attended ? 1 : 0;

    // Check if a record already exists
    const existingRecord = db
      .prepare(
        "SELECT id FROM elite_attendance WHERE session_id = ? AND student_id = ?"
      )
      .get(body.session_id, body.student_id) as { id: string } | undefined;

    if (existingRecord) {
      // Update existing record
      db.prepare(
        "UPDATE elite_attendance SET attended = ?, notes = ? WHERE id = ?"
      ).run(attendedInt, body.notes ?? "", existingRecord.id);
    } else {
      // Insert new record
      const id = uuidv4();
      db.prepare(
        `INSERT INTO elite_attendance (id, session_id, student_id, attended, notes)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, body.session_id, body.student_id, attendedInt, body.notes ?? "");
    }

    const attendance = db
      .prepare(
        "SELECT * FROM elite_attendance WHERE session_id = ? AND student_id = ?"
      )
      .get(body.session_id, body.student_id) as EliteAttendanceRow;

    return NextResponse.json({ attendance }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/students/attendance]", error);
    return NextResponse.json(
      { error: "Failed to upsert attendance" },
      { status: 500 }
    );
  }
}
