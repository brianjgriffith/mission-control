import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/students/sessions
// Returns elite sessions with attendance counts.
// Optional filters: ?month (YYYY-MM), ?session_type
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const sessionType = searchParams.get("session_type");

    // Get total active elite students count
    const { count: eliteCount } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("program", "elite")
      .eq("status", "active");

    const eliteCnt = eliteCount ?? 0;

    // Build session query
    let query = supabase
      .from("elite_sessions")
      .select("*");

    if (month) {
      query = query.like("session_date", `${month}%`);
    }
    if (sessionType) {
      query = query.eq("session_type", sessionType);
    }

    query = query.order("session_date", { ascending: false });

    const { data: sessions, error } = await query;

    if (error) throw error;

    // For each session, get attendance count
    const result = await Promise.all(
      (sessions ?? []).map(async (s) => {
        const { count: attendanceCount } = await supabase
          .from("elite_attendance")
          .select("*", { count: "exact", head: true })
          .eq("session_id", s.id)
          .eq("attended", true);

        return {
          ...s,
          attendance_count: attendanceCount ?? 0,
          total_elite_students: eliteCnt,
        };
      })
    );

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
    const supabase = await createClient();

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

    const { data: session, error } = await supabase
      .from("elite_sessions")
      .insert({
        title: body.title.trim(),
        session_type: body.session_type,
        session_date: body.session_date,
        facilitator: body.facilitator ?? "",
        notes: body.notes ?? "",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/students/sessions]", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
