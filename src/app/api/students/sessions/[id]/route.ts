import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// PATCH /api/students/sessions/[id]
// Update session fields.
// ---------------------------------------------------------------------------

interface PatchSessionBody {
  title?: string;
  session_type?: string;
  session_date?: string;
  facilitator?: string;
  notes?: string;
}

const ALLOWED_FIELDS = [
  "title",
  "session_type",
  "session_date",
  "facilitator",
  "notes",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_SESSION_TYPES = ["workshop", "mastermind"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as PatchSessionBody;
    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("elite_sessions")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Validate specific fields if provided
    if (body.title !== undefined && (!body.title || !body.title.trim())) {
      return NextResponse.json(
        { error: "title cannot be empty" },
        { status: 400 }
      );
    }

    if (
      body.session_type !== undefined &&
      !VALID_SESSION_TYPES.includes(body.session_type)
    ) {
      return NextResponse.json(
        { error: "session_type must be 'workshop' or 'mastermind'" },
        { status: 400 }
      );
    }

    if (body.session_date !== undefined && !DATE_RE.test(body.session_date)) {
      return NextResponse.json(
        { error: "session_date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    // Build update payload
    const updateData: Record<string, unknown> = {};

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        const raw = body[field as keyof PatchSessionBody];
        if (field === "title" && typeof raw === "string") {
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

    updateData.updated_at = new Date().toISOString();

    const { data: session, error: updateError } = await supabase
      .from("elite_sessions")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ session });
  } catch (error) {
    console.error("[PATCH /api/students/sessions/:id]", error);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/students/sessions/[id]
// Remove session and its attendance records.
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("elite_sessions")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Delete attendance records first, then the session
    await supabase.from("elite_attendance").delete().eq("session_id", id);
    const { error: deleteError } = await supabase
      .from("elite_sessions")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/students/sessions/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}
