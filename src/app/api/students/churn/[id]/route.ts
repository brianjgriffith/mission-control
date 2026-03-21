import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const supabase = await createClient();

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

    // Build update payload from allowed fields
    const updateData: Record<string, unknown> = {};

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updateData[field] = body[field as keyof PatchChurnBody] ?? "";
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("churn_events")
      .update(updateData)
      .eq("id", id);

    if (updateError) throw updateError;

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
        await supabase
          .from("students")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", existing.student_id);
      }
    }

    // Fetch the updated event with student name
    const { data: event, error: refetchError } = await supabase
      .from("churn_events")
      .select("*, students(name)")
      .eq("id", id)
      .single();

    if (refetchError) throw refetchError;

    // Flatten to match response shape
    const { students: studentData, ...rest } = event as Record<string, unknown>;
    const result = {
      ...rest,
      student_name: (studentData as { name: string } | null)?.name ?? null,
    };

    return NextResponse.json({ event: result });
  } catch (error) {
    console.error("[PATCH /api/students/churn/:id]", error);
    return NextResponse.json(
      { error: "Failed to update churn event" },
      { status: 500 }
    );
  }
}
