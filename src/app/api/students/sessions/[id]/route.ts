import { NextRequest, NextResponse } from "next/server";
import { getDb, type EliteSessionRow } from "@/lib/db";

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
    const db = getDb();

    const existing = db
      .prepare("SELECT * FROM elite_sessions WHERE id = ?")
      .get(id) as EliteSessionRow | undefined;

    if (!existing) {
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

    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        setClauses.push(`${field} = ?`);
        const raw = body[field as keyof PatchSessionBody];
        if (field === "title" && typeof raw === "string") {
          values.push(raw.trim());
        } else {
          values.push(raw ?? "");
        }
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    setClauses.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(
      `UPDATE elite_sessions SET ${setClauses.join(", ")} WHERE id = ?`
    ).run(...values);

    const session = db
      .prepare("SELECT * FROM elite_sessions WHERE id = ?")
      .get(id) as EliteSessionRow;

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
    const db = getDb();

    const existing = db
      .prepare("SELECT id FROM elite_sessions WHERE id = ?")
      .get(id);

    if (!existing) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    db.transaction(() => {
      db.prepare("DELETE FROM elite_attendance WHERE session_id = ?").run(id);
      db.prepare("DELETE FROM elite_sessions WHERE id = ?").run(id);
    })();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/students/sessions/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}
