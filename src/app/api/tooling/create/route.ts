import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type AssetRow } from "@/lib/db";
import fs from "fs";
import path from "path";
import os from "os";

// ---------------------------------------------------------------------------
// POST /api/tooling/create
// Writes a real skill or agent file to disk AND creates the DB asset +
// tooling_metadata records.
// ---------------------------------------------------------------------------

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const SKILLS_DIR = path.join(CLAUDE_DIR, "skills");
const AGENTS_DIR = path.join(CLAUDE_DIR, "agents");
const PROJECT_ID = "proj-claude-tooling";

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface CreateBody {
  type: "skill" | "agent";
  name: string;
  displayName: string;
  description: string;
  content?: string;
  category?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBody;

    // ---- Validation --------------------------------------------------------

    if (!body.type || !["skill", "agent"].includes(body.type)) {
      return NextResponse.json(
        { error: 'type must be "skill" or "agent"' },
        { status: 400 }
      );
    }

    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    if (!KEBAB_RE.test(body.name)) {
      return NextResponse.json(
        { error: "name must be kebab-case (lowercase letters, numbers, hyphens)" },
        { status: 400 }
      );
    }

    if (!body.displayName || typeof body.displayName !== "string" || !body.displayName.trim()) {
      return NextResponse.json(
        { error: "displayName is required" },
        { status: 400 }
      );
    }

    if (!body.description || typeof body.description !== "string" || !body.description.trim()) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      );
    }

    // ---- Determine file path -----------------------------------------------

    let filePath: string;

    if (body.type === "skill") {
      const skillDir = path.join(SKILLS_DIR, body.name);
      filePath = path.join(skillDir, "SKILL.md");
    } else {
      // Agent
      const category = body.category || "general";
      const agentDir = path.join(AGENTS_DIR, category);
      filePath = path.join(agentDir, `${body.name}.md`);
    }

    // Check file doesn't already exist
    if (fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `File already exists: ${filePath}` },
        { status: 409 }
      );
    }

    // ---- Build file content ------------------------------------------------

    let fileContent: string;
    const contentBody =
      body.content?.trim() ||
      (body.type === "skill"
        ? "<!-- Add your skill instructions here -->"
        : "<!-- Add your agent instructions here -->");

    if (body.type === "skill") {
      fileContent = `---
name: ${body.name}
description: ${body.description.trim()}
---

# ${body.displayName.trim()}

${contentBody}
`;
    } else {
      fileContent = `---
name: ${body.name}
description: ${body.description.trim()}
color: blue
tools: Read, Write, MultiEdit, Bash, Grep
---

# ${body.displayName.trim()}

${contentBody}
`;
    }

    // ---- Write file to disk ------------------------------------------------

    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, fileContent, "utf-8");

    // ---- Create DB records -------------------------------------------------

    const db = getDb();
    const assetId = uuidv4();
    const metadataId = uuidv4();

    const maxRow = db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM assets WHERE project_id = ?"
      )
      .get(PROJECT_ID) as { max_order: number };
    const sortOrder = maxRow.max_order + 1;

    db.transaction(() => {
      db.prepare(
        `INSERT INTO assets (id, project_id, name, description, asset_type, status, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        assetId,
        PROJECT_ID,
        body.displayName.trim(),
        body.description.trim(),
        body.type,
        "active",
        sortOrder
      );

      db.prepare(
        `INSERT INTO tooling_metadata (id, asset_id, repo_path, usage_frequency, optimization_notes)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        metadataId,
        assetId,
        filePath,
        "unknown",
        body.type === "agent" ? "tools: Read, Write, MultiEdit, Bash, Grep" : ""
      );

      db.prepare(
        "INSERT INTO activity_log (id, asset_id, project_id, action, details) VALUES (?, ?, ?, ?, ?)"
      ).run(
        uuidv4(),
        assetId,
        PROJECT_ID,
        "asset_created",
        `Created ${body.type} "${body.displayName.trim()}" at ${filePath}`
      );
    })();

    const asset = db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(assetId) as AssetRow;

    return NextResponse.json({ asset, filePath }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/tooling/create]", error);
    return NextResponse.json(
      { error: "Failed to create tooling file" },
      { status: 500 }
    );
  }
}
