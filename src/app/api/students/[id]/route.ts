import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  archived?: boolean;
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
  "archived",
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
    const supabase = createAdminClient();

    // Check if student exists
    const { data: existing, error: fetchError } = await supabase
      .from("students")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
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

    // Build the update payload from allowed fields
    const updateData: Record<string, unknown> = {};

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        const raw = body[field as keyof PatchStudentBody];
        if (field === "name" && typeof raw === "string") {
          updateData[field] = raw.trim();
        } else {
          updateData[field] = raw ?? "";
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Auto-set archived_at when archiving/unarchiving
    if ("archived" in updateData) {
      updateData.archived_at = updateData.archived
        ? new Date().toISOString()
        : null;
    }

    updateData.updated_at = new Date().toISOString();

    const { data: student, error: updateError } = await supabase
      .from("students")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

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
    const supabase = createAdminClient();

    const { data: existing, error: fetchError } = await supabase
      .from("students")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    // Delete related records first, then the student
    await supabase.from("churn_events").delete().eq("student_id", id);
    await supabase.from("elite_attendance").delete().eq("student_id", id);
    const { error: deleteError } = await supabase
      .from("students")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/students/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete student" },
      { status: 500 }
    );
  }
}
