import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/students
// Returns students. Optional filters: ?program, ?status, ?coach, ?search
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const program = searchParams.get("program");
    const status = searchParams.get("status");
    const coach = searchParams.get("coach");
    const search = searchParams.get("search");

    let query = supabase.from("students").select("*");

    if (program) {
      query = query.eq("program", program);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (coach) {
      query = query.eq("coach", coach);
    }
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,email.ilike.%${search}%,youtube_channel.ilike.%${search}%`
      );
    }

    query = query.order("name", { ascending: true });

    const { data: students, error } = await query;

    if (error) throw error;

    return NextResponse.json({ students });
  } catch (error) {
    console.error("[GET /api/students]", error);
    return NextResponse.json(
      { error: "Failed to fetch students" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/students
// Create a new student.
// ---------------------------------------------------------------------------

interface CreateStudentBody {
  name: string;
  email?: string;
  youtube_channel?: string;
  coach?: string;
  program: string;
  monthly_revenue: number;
  signup_date: string;
  payment_plan?: string;
  renewal_date?: string;
  notes?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateStudentBody;
    const supabase = await createClient();

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    if (!body.program || typeof body.program !== "string") {
      return NextResponse.json(
        { error: "program is required" },
        { status: 400 }
      );
    }

    if (!["elite", "accelerator"].includes(body.program)) {
      return NextResponse.json(
        { error: "program must be 'elite' or 'accelerator'" },
        { status: 400 }
      );
    }

    if (!body.signup_date || !DATE_RE.test(body.signup_date)) {
      return NextResponse.json(
        { error: "signup_date is required and must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    if (typeof body.monthly_revenue !== "number") {
      return NextResponse.json(
        { error: "monthly_revenue is required and must be a number" },
        { status: 400 }
      );
    }

    const { data: student, error } = await supabase
      .from("students")
      .insert({
        name: body.name.trim(),
        email: body.email ?? "",
        youtube_channel: body.youtube_channel ?? "",
        coach: body.coach ?? "",
        program: body.program,
        monthly_revenue: body.monthly_revenue,
        signup_date: body.signup_date,
        status: "active",
        payment_plan: body.payment_plan ?? "",
        renewal_date: body.renewal_date ?? "",
        notes: body.notes ?? "",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ student }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/students]", error);
    return NextResponse.json(
      { error: "Failed to create student" },
      { status: 500 }
    );
  }
}
