import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// GET /api/students/capacity/coaches
// Returns all coaches from coach_capacity table.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const db = getDb();
    const coaches = db
      .prepare("SELECT * FROM coach_capacity ORDER BY coach_name ASC")
      .all();
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
    const db = getDb();
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

    const id = crypto.randomUUID();

    db.prepare(
      `INSERT INTO coach_capacity (id, coach_name, max_students, preferred_max, status, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, coach_name, max_students, preferred_max, status, notes);

    return NextResponse.json({ id }, { status: 201 });
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
    const db = getDb();
    const body = await request.json();
    const { id, max_students, preferred_max, status, notes } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (max_students !== undefined) {
      fields.push("max_students = ?");
      values.push(max_students);
    }
    if (preferred_max !== undefined) {
      fields.push("preferred_max = ?");
      values.push(preferred_max);
    }
    if (status !== undefined) {
      fields.push("status = ?");
      values.push(status);
    }
    if (notes !== undefined) {
      fields.push("notes = ?");
      values.push(notes);
    }

    if (fields.length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(
      `UPDATE coach_capacity SET ${fields.join(", ")} WHERE id = ?`
    ).run(...values);

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
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    db.prepare("DELETE FROM coach_capacity WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/students/capacity/coaches]", error);
    return NextResponse.json(
      { error: "Failed to delete coach" },
      { status: 500 }
    );
  }
}
