import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// PATCH /api/meetings/[id]
// Update meeting outcome and notes.
// Body: { outcome: string, outcome_notes?: string }
// ---------------------------------------------------------------------------

const VALID_OUTCOMES = [
  "pending",
  "completed",
  "no_show",
  "rescheduled",
  "not_qualified",
  "lead",
  "sold",
] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const body = await request.json();

    const { outcome, outcome_notes } = body;

    // Validate outcome
    if (!outcome || !VALID_OUTCOMES.includes(outcome)) {
      return NextResponse.json(
        { error: `Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(", ")}` },
        { status: 400 }
      );
    }

    // Build update payload
    const update: Record<string, any> = {
      outcome,
      outcome_tagged_at: new Date().toISOString(),
    };
    if (outcome_notes !== undefined) {
      update.outcome_notes = outcome_notes;
    }

    const { data: meeting, error } = await supabase
      .from("meetings")
      .update(update)
      .eq("id", id)
      .select(
        `
        *,
        contacts (id, email, first_name, last_name, full_name),
        sales_reps (id, name, email)
      `
      )
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Meeting not found" },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json({ meeting });
  } catch (error) {
    console.error("[PATCH /api/meetings/[id]]", error);
    return NextResponse.json(
      { error: "Failed to update meeting" },
      { status: 500 }
    );
  }
}
