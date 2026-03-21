import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/students/capacity/coaches
// Returns all coaches from coach_capacity table.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: coaches, error } = await supabase
      .from("coach_capacity")
      .select("*")
      .order("coach_name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ coaches });
  } catch (error) {
    console.error("[GET /api/students/capacity/coaches]", error);
    return NextResponse.json(
      { error: "Failed to fetch coaches" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/students/capacity/coaches
// Create a new coach.
// Body: { coach_name, max_students?, preferred_max?, status?, notes? }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      coach_name,
      max_students = 20,
      preferred_max = 17,
      status = "active",
      notes = "",
    } = body;

    if (!coach_name) {
      return NextResponse.json(
        { error: "coach_name is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("coach_capacity")
      .insert({ coach_name, max_students, preferred_max, status, notes })
      .select("id")
      .single();

    if (error) throw error;

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/students/capacity/coaches]", error);
    return NextResponse.json(
      { error: "Failed to create coach" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PUT /api/students/capacity/coaches
// Update a coach.
// Body: { id, max_students?, preferred_max?, status?, notes? }
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { id, max_students, preferred_max, status, notes } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (max_students !== undefined) updateData.max_students = max_students;
    if (preferred_max !== undefined) updateData.preferred_max = preferred_max;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("coach_capacity")
      .update(updateData)
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PUT /api/students/capacity/coaches]", error);
    return NextResponse.json(
      { error: "Failed to update coach" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/students/capacity/coaches?id=<coach_id>
// Delete a coach by ID.
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("coach_capacity")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/students/capacity/coaches]", error);
    return NextResponse.json(
      { error: "Failed to delete coach" },
      { status: 500 }
    );
  }
}
