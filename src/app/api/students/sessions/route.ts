import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type EliteSessionRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/students/sessions
// Returns elite sessions with attendance counts.
// Optional filters: ?month (YYYY-MM), ?session_type
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const sessionType = searchParams.get("session_type");

    const filters: string[] = [];
    const values: unknown[] = [];

    if (month) {
      filters.push("es.session_date LIKE ?");
      values.push(`${month}%`);
    }
    if (sessionType) {
      filters.push("es.session_type = ?");
      values.push(sessionType);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    // Get total active elite students count
    const eliteCount = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM students WHERE program = 'elite' AND status = 'active'"
      )
      .get() as { cnt: number };

    const sessions = db
      .prepare(
        `SELECT es.*,
                COALESCE(att.attendance_count, 0) AS attendance_count
         FROM elite_sessions es
         LEFT JOIN (
           SELECT session_id, COUNT(*) AS attendance_count
           FROM elite_attendance
           WHERE attended = 1
           GROUP BY session_id
         ) att ON att.session_id = es.id
         ${where}
         ORDER BY es.session_date DESC`
      )
      .all(...values) as (EliteSessionRow & { attendance_count: number })[];

    // Attach total_elite_students to each session
    const result = sessions.map((s) => ({
      ...s,
      total_elite_students: eliteCount.cnt,
    }));

    return NextResponse.json({ sessions: result });
  } catch (error) {
    console.error("[GET /api/students/sessions]", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/students/sessions
// Create a new elite session.
// ---------------------------------------------------------------------------

interface CreateSessionBody {
  title: string;
  session_type: string;
  session_date: string;
  facilitator?: string;
  notes?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_SESSION_TYPES = ["workshop", "mastermind"];

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateSessionBody;
    const db = getDb();

    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    if (
      !body.session_type ||
      !VALID_SESSION_TYPES.includes(body.session_type)
    ) {
      return NextResponse.json(
        { error: "session_type is required and must be 'workshop' or 'mastermind'" },
        { status: 400 }
      );
    }

    if (!body.session_date || !DATE_RE.test(body.session_date)) {
      return NextResponse.json(
        { error: "session_date is required and must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO elite_sessions (id, title, session_type, session_date, facilitator, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      body.title.trim(),
      body.session_type,
      body.session_date,
      body.facilitator ?? "",
      body.notes ?? ""
    );

    const session = db
      .prepare("SELECT * FROM elite_sessions WHERE id = ?")
      .get(id) as EliteSessionRow;

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/students/sessions]", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
