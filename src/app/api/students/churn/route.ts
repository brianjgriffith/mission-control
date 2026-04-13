import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/students/churn
// Returns churn events joined with student name.
// Optional filters: ?month (YYYY-MM), ?event_type, ?coach
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const eventType = searchParams.get("event_type");
    const coach = searchParams.get("coach");
    const studentId = searchParams.get("student_id");

    let query = supabase
      .from("churn_events")
      .select("*, students(name)");

    if (month) {
      query = query.like("event_date", `${month}%`);
    }
    if (eventType) {
      query = query.eq("event_type", eventType);
    }
    if (coach) {
      query = query.eq("coach", coach);
    }
    if (studentId) {
      query = query.eq("student_id", studentId);
    }

    query = query.order("event_date", { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    // Flatten the joined student name to match the original response shape
    const events = (data ?? []).map((row: Record<string, unknown>) => {
      const { students: studentData, ...rest } = row;
      return {
        ...rest,
        student_name: (studentData as { name: string } | null)?.name ?? null,
      };
    });

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
    const supabase = createAdminClient();

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

    // Insert churn event
    const { data: event, error: insertError } = await supabase
      .from("churn_events")
      .insert({
        student_id: body.student_id,
        event_type: body.event_type,
        event_date: body.event_date,
        reason: body.reason ?? "",
        monthly_revenue_impact: body.monthly_revenue_impact,
        coach: body.coach ?? "",
        notes: body.notes ?? "",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Update student status
    const newStatus = EVENT_TYPE_TO_STATUS[body.event_type];
    const { error: updateError } = await supabase
      .from("students")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", body.student_id);

    if (updateError) throw updateError;

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
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const { data: existing, error: fetchError } = await supabase
      .from("churn_events")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Churn event not found" },
        { status: 404 }
      );
    }

    // Delete the churn event
    const { error: deleteError } = await supabase
      .from("churn_events")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    // Determine correct status: check if other churn events remain for this student
    const { data: remainingEvents } = await supabase
      .from("churn_events")
      .select("event_type, event_date")
      .eq("student_id", existing.student_id)
      .order("event_date", { ascending: false })
      .limit(1);

    const newStatus = remainingEvents && remainingEvents.length > 0
      ? (EVENT_TYPE_TO_STATUS[remainingEvents[0].event_type] ?? "active")
      : "active";

    const { error: updateError } = await supabase
      .from("students")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", existing.student_id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/students/churn]", error);
    return NextResponse.json(
      { error: "Failed to delete churn event" },
      { status: 500 }
    );
  }
}
