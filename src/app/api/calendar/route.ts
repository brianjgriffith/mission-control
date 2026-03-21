import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/calendar
// Returns calendar events within a date range.
// Required: ?start=YYYY-MM-DD&end=YYYY-MM-DD
// Optional: ?event_type=xxx
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const eventType = searchParams.get("event_type");

    if (!start || !end) {
      return NextResponse.json(
        { error: "start and end query parameters are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
      return NextResponse.json(
        { error: "start and end must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("calendar_events")
      .select("*")
      .lte("start_date", end)
      .or(`end_date.gte.${start},and(end_date.is.null,start_date.gte.${start})`)
      .order("start_date", { ascending: true });

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    const { data: events, error } = await query;

    if (error) throw error;

    return NextResponse.json({ events });
  } catch (error) {
    console.error("[GET /api/calendar]", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar events" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/calendar
// Create a new calendar event.
// ---------------------------------------------------------------------------

interface CreateEventBody {
  title: string;
  start_date: string;
  end_date?: string | null;
  event_type?: string;
  color?: string;
  description?: string;
  project_id?: string | null;
  all_day?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateEventBody;
    const supabase = createAdminClient();

    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    if (!body.start_date || !DATE_RE.test(body.start_date)) {
      return NextResponse.json(
        { error: "start_date is required and must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    if (body.end_date) {
      if (!DATE_RE.test(body.end_date)) {
        return NextResponse.json(
          { error: "end_date must be in YYYY-MM-DD format" },
          { status: 400 }
        );
      }
      if (body.end_date < body.start_date) {
        return NextResponse.json(
          { error: "end_date must be >= start_date" },
          { status: 400 }
        );
      }
    }

    const { data: event, error } = await supabase
      .from("calendar_events")
      .insert({
        title: body.title.trim(),
        description: body.description ?? "",
        start_date: body.start_date,
        end_date: body.end_date ?? null,
        event_type: body.event_type ?? "custom",
        color: body.color ?? "",
        all_day: body.all_day !== false,
        project_id: body.project_id ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/calendar]", error);
    return NextResponse.json(
      { error: "Failed to create calendar event" },
      { status: 500 }
    );
  }
}
