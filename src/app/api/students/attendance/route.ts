import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/students/attendance
// Returns attendance for a session plus all active elite students not yet
// in the attendance table (so the UI can render a complete checklist).
// Required: ?session_id=xxx
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");
    const studentId = searchParams.get("student_id");

    // Student mode: return all sessions the student attended
    if (studentId) {
      const { data, error } = await supabase
        .from("elite_attendance")
        .select("attended, elite_sessions(id, title, session_type, session_date)")
        .eq("student_id", studentId)
        .eq("attended", true);

      if (error) throw error;

      const sessions = (data ?? []).map((row: Record<string, unknown>) => {
        const es = row.elite_sessions as {
          id: string;
          title: string;
          session_type: string;
          session_date: string;
        };
        return {
          id: es.id,
          title: es.title,
          session_type: es.session_type,
          session_date: es.session_date,
          attended: row.attended,
        };
      });

      // Sort by session_date descending
      sessions.sort((a, b) => b.session_date.localeCompare(a.session_date));

      return NextResponse.json({ sessions });
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: "session_id or student_id query parameter is required" },
        { status: 400 }
      );
    }

    // Verify session exists
    const { data: session, error: sessionError } = await supabase
      .from("elite_sessions")
      .select("id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Get existing attendance records joined with student names
    const { data: existingData, error: attError } = await supabase
      .from("elite_attendance")
      .select("*, students(name)")
      .eq("session_id", sessionId);

    if (attError) throw attError;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (existingData ?? []).map((row: any) => {
      const { students: studentData, ...rest } = row;
      return {
        ...rest,
        student_name: (studentData as { name: string } | null)?.name ?? "",
      };
    });

    // Get active elite students who do NOT have an attendance record yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attendedStudentIds = existing.map((r: any) => r.student_id as string);

    let missingQuery = supabase
      .from("students")
      .select("id, name")
      .eq("program", "elite")
      .eq("status", "active")
      .order("name", { ascending: true });

    if (attendedStudentIds.length > 0) {
      // Filter out students who already have attendance records
      // Use .not().in() to exclude them
      missingQuery = missingQuery.not(
        "id",
        "in",
        `(${attendedStudentIds.join(",")})`
      );
    }

    const { data: missing } = await missingQuery;

    // Build placeholder records for missing students
    const missingRecords = (missing ?? []).map((s) => ({
      id: null as string | null,
      session_id: sessionId,
      student_id: s.id,
      attended: false,
      notes: "",
      created_at: "",
      student_name: s.name,
    }));

    const attendance = [
      ...existing,
      ...missingRecords,
    ].sort((a: { student_name: string }, b: { student_name: string }) =>
      a.student_name.localeCompare(b.student_name)
    );

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
// Upsert attendance record.
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
    const supabase = createAdminClient();

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
    const { data: session, error: sessionError } = await supabase
      .from("elite_sessions")
      .select("id")
      .eq("id", body.session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Verify student exists
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id")
      .eq("id", body.student_id)
      .single();

    if (studentError || !student) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    const attendedBool = !!body.attended;

    // Check if a record already exists
    const { data: existingRecord } = await supabase
      .from("elite_attendance")
      .select("id")
      .eq("session_id", body.session_id)
      .eq("student_id", body.student_id)
      .single();

    if (existingRecord) {
      // Update existing record
      await supabase
        .from("elite_attendance")
        .update({ attended: attendedBool, notes: body.notes ?? "" })
        .eq("id", existingRecord.id);
    } else {
      // Insert new record
      await supabase
        .from("elite_attendance")
        .insert({
          session_id: body.session_id,
          student_id: body.student_id,
          attended: attendedBool,
          notes: body.notes ?? "",
        });
    }

    // Fetch the final record
    const { data: attendance, error: fetchError } = await supabase
      .from("elite_attendance")
      .select("*")
      .eq("session_id", body.session_id)
      .eq("student_id", body.student_id)
      .single();

    if (fetchError) throw fetchError;

    return NextResponse.json({ attendance }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/students/attendance]", error);
    return NextResponse.json(
      { error: "Failed to upsert attendance" },
      { status: 500 }
    );
  }
}
