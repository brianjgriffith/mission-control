import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type StudentRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/students
// Returns students. Optional filters: ?program, ?status, ?coach, ?search
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const program = searchParams.get("program");
    const status = searchParams.get("status");
    const coach = searchParams.get("coach");
    const search = searchParams.get("search");

    const filters: string[] = [];
    const values: unknown[] = [];

    if (program) {
      filters.push("program = ?");
      values.push(program);
    }
    if (status) {
      filters.push("status = ?");
      values.push(status);
    }
    if (coach) {
      filters.push("coach = ?");
      values.push(coach);
    }
    if (search) {
      filters.push(
        "(name LIKE ? OR email LIKE ? OR youtube_channel LIKE ?)"
      );
      const term = `%${search}%`;
      values.push(term, term, term);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const students = db
      .prepare(`SELECT * FROM students ${where} ORDER BY name ASC`)
      .all(...values) as StudentRow[];

    return NextResponse.json({ students });
  } catch (error) {
    console.error("[GET /api/students]", error);
    return NextResponse.json(
      { error: "Failed to fetch students" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/students
// Create a new student.
// ---------------------------------------------------------------------------

interface CreateStudentBody {
  name: string;
  email?: string;
  youtube_channel?: string;
  coach?: string;
  program: string;
  monthly_revenue: number;
  signup_date: string;
  payment_plan?: string;
  renewal_date?: string;
  notes?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateStudentBody;
    const db = getDb();

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    if (!body.program || typeof body.program !== "string") {
      return NextResponse.json(
        { error: "program is required" },
        { status: 400 }
      );
    }

    if (!["elite", "accelerator"].includes(body.program)) {
      return NextResponse.json(
        { error: "program must be 'elite' or 'accelerator'" },
        { status: 400 }
      );
    }

    if (!body.signup_date || !DATE_RE.test(body.signup_date)) {
      return NextResponse.json(
        { error: "signup_date is required and must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    if (typeof body.monthly_revenue !== "number") {
      return NextResponse.json(
        { error: "monthly_revenue is required and must be a number" },
        { status: 400 }
      );
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO students (id, name, email, youtube_channel, coach, program, monthly_revenue, signup_date, status, payment_plan, renewal_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
    ).run(
      id,
      body.name.trim(),
      body.email ?? "",
      body.youtube_channel ?? "",
      body.coach ?? "",
      body.program,
      body.monthly_revenue,
      body.signup_date,
      body.payment_plan ?? "",
      body.renewal_date ?? "",
      body.notes ?? ""
    );

    const student = db
      .prepare("SELECT * FROM students WHERE id = ?")
      .get(id) as StudentRow;

    return NextResponse.json({ student }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/students]", error);
    return NextResponse.json(
      { error: "Failed to create student" },
      { status: 500 }
    );
  }
}
