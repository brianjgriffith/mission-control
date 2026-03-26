import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// POST /api/students/data-quality/confirm
// Confirm or dismiss a data quality review item.
//
// Body: {
//   action: "confirm_churn" | "dismiss" | "mark_partner" | "mark_student",
//   student_id: string,
//   reason?: string,
//   journey_event_id?: string,
//   linked_student_email?: string,  // required for mark_partner
// }
// ---------------------------------------------------------------------------

const VALID_ACTIONS = ["confirm_churn", "dismiss", "mark_partner", "mark_student"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    const { action, student_id, reason, journey_event_id, linked_student_email } = body;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!student_id || typeof student_id !== "string") {
      return NextResponse.json(
        { error: "student_id is required" },
        { status: 400 }
      );
    }

    // Verify student exists
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, name, email, coach, monthly_revenue, program")
      .eq("id", student_id)
      .single();

    if (studentError || !student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // -----------------------------------------------------------------------
    // confirm_churn: create churn event + update student status to cancelled
    // -----------------------------------------------------------------------
    if (action === "confirm_churn") {
      const eventDate = new Date().toISOString().slice(0, 10);

      const { data: churnEvent, error: insertError } = await supabase
        .from("churn_events")
        .insert({
          student_id,
          event_type: "cancel",
          event_date: eventDate,
          reason: reason || "",
          monthly_revenue_impact: student.monthly_revenue || 0,
          coach: student.coach || "",
          notes: "Confirmed via Data Quality panel",
          source: "data_quality_panel",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Update student status
      const { error: updateError } = await supabase
        .from("students")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", student_id);

      if (updateError) throw updateError;

      // Mark journey event as reviewed if provided
      if (journey_event_id) {
        await supabase
          .from("journey_events")
          .update({
            metadata: { reviewed: true, reviewed_at: new Date().toISOString(), action: "confirm_churn" },
          })
          .eq("id", journey_event_id);
      }

      return NextResponse.json({ success: true, churn_event: churnEvent });
    }

    // -----------------------------------------------------------------------
    // dismiss: mark journey event as reviewed without creating churn event
    // -----------------------------------------------------------------------
    if (action === "dismiss") {
      if (journey_event_id) {
        const { error: updateError } = await supabase
          .from("journey_events")
          .update({
            metadata: { reviewed: true, reviewed_at: new Date().toISOString(), action: "dismissed" },
          })
          .eq("id", journey_event_id);

        if (updateError) throw updateError;
      }

      return NextResponse.json({ success: true });
    }

    // -----------------------------------------------------------------------
    // mark_partner: update member_type to partner, optionally link to student
    // -----------------------------------------------------------------------
    if (action === "mark_partner") {
      const updates: Record<string, unknown> = {
        member_type: "partner",
        classification_source: "manual",
        updated_at: new Date().toISOString(),
      };

      // If linked_student_email provided, find that student and link
      if (linked_student_email) {
        const { data: linkedStudent } = await supabase
          .from("students")
          .select("id")
          .eq("email", linked_student_email.trim().toLowerCase())
          .maybeSingle();

        if (linkedStudent) {
          updates.linked_student_id = linkedStudent.id;
        }
      }

      const { error: updateError } = await supabase
        .from("students")
        .update(updates)
        .eq("id", student_id);

      if (updateError) throw updateError;

      return NextResponse.json({ success: true });
    }

    // -----------------------------------------------------------------------
    // mark_student: update member_type to student
    // -----------------------------------------------------------------------
    if (action === "mark_student") {
      const { error: updateError } = await supabase
        .from("students")
        .update({
          member_type: "student",
          classification_source: "manual",
          updated_at: new Date().toISOString(),
        })
        .eq("id", student_id);

      if (updateError) throw updateError;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unhandled action" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/students/data-quality/confirm]", error);
    return NextResponse.json(
      { error: "Failed to process confirmation" },
      { status: 500 }
    );
  }
}
