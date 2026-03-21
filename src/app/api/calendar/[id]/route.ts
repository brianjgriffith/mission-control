import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// PATCH /api/calendar/[id]
// ---------------------------------------------------------------------------

interface PatchBody {
  title?: string;
  description?: string;
  start_date?: string;
  end_date?: string | null;
  event_type?: string;
  color?: string;
  all_day?: boolean;
  project_id?: string | null;
}

const ALLOWED_FIELDS = [
  "title",
  "description",
  "start_date",
  "end_date",
  "event_type",
  "color",
  "all_day",
  "project_id",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as PatchBody;
    const supabase = await createClient();

    // Check if event exists
    const { data: existing, error: fetchError } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Validate date fields if provided
    if (body.start_date !== undefined && !DATE_RE.test(body.start_date)) {
      return NextResponse.json(
        { error: "start_date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    if (body.end_date !== undefined && body.end_date !== null && !DATE_RE.test(body.end_date)) {
      return NextResponse.json(
        { error: "end_date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    // Cross-validate: end_date >= start_date
    const effectiveStart = body.start_date ?? existing.start_date;
    const effectiveEnd = body.end_date !== undefined ? body.end_date : existing.end_date;
    if (effectiveEnd !== null && effectiveEnd < effectiveStart) {
      return NextResponse.json(
        { error: "end_date must be >= start_date" },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updates[field] = body[field as keyof PatchBody] ?? null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data: event, error: updateError } = await supabase
      .from("calendar_events")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ event });
  } catch (error) {
    console.error("[PATCH /api/calendar/:id]", error);
    return NextResponse.json(
      { error: "Failed to update event" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/calendar/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check if event exists
    const { data: existing, error: fetchError } = await supabase
      .from("calendar_events")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/calendar/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete event" },
      { status: 500 }
    );
  }
}
