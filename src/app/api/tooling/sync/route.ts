import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, type ToolingMetadataRow } from "@/lib/db";
import fs from "fs";
import path from "path";
import os from "os";

// ---------------------------------------------------------------------------
// POST /api/tooling/sync
// Scans ~/.claude/skills and ~/.claude/agents for .md files, compares against
// existing DB records (matched by repo_path in tooling_metadata), and creates
// assets for anything new.
// ---------------------------------------------------------------------------

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const SKILLS_DIR = path.join(CLAUDE_DIR, "skills");
const AGENTS_DIR = path.join(CLAUDE_DIR, "agents");
const PROJECT_ID = "proj-claude-tooling";

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

interface Frontmatter {
  name?: string;
  description?: string;
  tools?: string;
  [key: string]: string | undefined;
}

function parseFrontmatter(content: string): {
  frontmatter: Frontmatter;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { frontmatter: {}, body: content };

  const raw = match[1];
  const body = content.slice(match[0].length).trim();
  const frontmatter: Frontmatter = {};

  let currentKey: string | null = null;
  let currentValue = "";

  for (const line of raw.split("\n")) {
    // Check if this line starts a new key: value pair
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      // Save previous key if any
      if (currentKey) {
        frontmatter[currentKey] = currentValue.trim();
      }
      currentKey = kvMatch[1];
      currentValue = kvMatch[2];
    } else if (currentKey && (line.startsWith("  ") || line.startsWith("\t"))) {
      // Continuation of multiline value
      currentValue += " " + line.trim();
    }
  }
  // Save the last key
  if (currentKey) {
    frontmatter[currentKey] = currentValue.trim();
  }

  // Strip surrounding quotes from values
  for (const key of Object.keys(frontmatter)) {
    const val = frontmatter[key];
    if (val && val.startsWith('"') && val.endsWith('"')) {
      frontmatter[key] = val.slice(1, -1);
    } else if (val && val.startsWith("'") && val.endsWith("'")) {
      frontmatter[key] = val.slice(1, -1);
    }
  }

  return { frontmatter, body };
}

// ---------------------------------------------------------------------------
// Filesystem scanning
// ---------------------------------------------------------------------------

interface ScannedFile {
  filePath: string;
  assetType: "skill" | "agent";
}

function scanSkills(): ScannedFile[] {
  const results: ScannedFile[] = [];
  if (!fs.existsSync(SKILLS_DIR)) return results;

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(SKILLS_DIR, entry.name, "SKILL.md");
    if (fs.existsSync(skillFile)) {
      results.push({ filePath: skillFile, assetType: "skill" });
    }
  }
  return results;
}

function scanAgentsDir(dir: string): ScannedFile[] {
  const results: ScannedFile[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanAgentsDir(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".md") &&
      entry.name.toLowerCase() !== "readme.md"
    ) {
      results.push({ filePath: fullPath, assetType: "agent" });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Derive name from file
// ---------------------------------------------------------------------------

function deriveName(
  filePath: string,
  frontmatter: Frontmatter,
  assetType: "skill" | "agent"
): string {
  if (frontmatter.name) {
    // Title-case and replace hyphens with spaces
    return frontmatter.name
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (assetType === "skill") {
    // Use the parent folder name
    const folderName = path.basename(path.dirname(filePath));
    return folderName
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Agent: use the filename without .md
  const fileName = path.basename(filePath, ".md");
  return fileName
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveDescription(frontmatter: Frontmatter, body: string): string {
  if (frontmatter.description) return frontmatter.description;

  // Use first non-heading paragraph from body
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("---")) {
      return trimmed.length > 200 ? trimmed.slice(0, 200) + "..." : trimmed;
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST() {
  try {
    const db = getDb();

    // Get all existing repo_paths from tooling_metadata
    const existingPaths = new Set(
      (
        db
          .prepare("SELECT repo_path FROM tooling_metadata WHERE repo_path != ''")
          .all() as Pick<ToolingMetadataRow, "repo_path">[]
      ).map((r) => r.repo_path)
    );

    // Scan filesystem
    const scannedFiles = [...scanSkills(), ...scanAgentsDir(AGENTS_DIR)];

    const details: { name: string; path: string; status: "added" | "existing" }[] = [];
    let added = 0;
    let existing = 0;

    const insertAsset = db.prepare(
      `INSERT INTO assets (id, project_id, name, description, asset_type, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insertMetadata = db.prepare(
      `INSERT INTO tooling_metadata (id, asset_id, repo_path, usage_frequency, optimization_notes)
       VALUES (?, ?, ?, ?, ?)`
    );
    const insertActivity = db.prepare(
      `INSERT INTO activity_log (id, asset_id, project_id, action, details)
       VALUES (?, ?, ?, ?, ?)`
    );
    const getMaxSort = db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM assets WHERE project_id = ?"
    );

    const syncAll = db.transaction(() => {
      for (const file of scannedFiles) {
        if (existingPaths.has(file.filePath)) {
          existing++;
          details.push({
            name: path.basename(file.filePath),
            path: file.filePath,
            status: "existing",
          });
          continue;
        }

        // Read and parse the file
        const content = fs.readFileSync(file.filePath, "utf-8");
        const { frontmatter, body } = parseFrontmatter(content);

        const name = deriveName(file.filePath, frontmatter, file.assetType);
        const description = deriveDescription(frontmatter, body);
        const optimizationNotes = frontmatter.tools
          ? `tools: ${frontmatter.tools}`
          : "";

        const assetId = uuidv4();
        const metadataId = uuidv4();

        const maxRow = getMaxSort.get(PROJECT_ID) as { max_order: number };
        const sortOrder = maxRow.max_order + 1;

        insertAsset.run(
          assetId,
          PROJECT_ID,
          name,
          description,
          file.assetType,
          "active",
          sortOrder
        );

        insertMetadata.run(
          metadataId,
          assetId,
          file.filePath,
          "unknown",
          optimizationNotes
        );

        insertActivity.run(
          uuidv4(),
          assetId,
          PROJECT_ID,
          "asset_created",
          `Synced from disk: ${file.filePath}`
        );

        added++;
        details.push({ name, path: file.filePath, status: "added" });
      }
    });

    syncAll();

    return NextResponse.json({
      added,
      existing,
      scanned: scannedFiles.length,
      details,
    });
  } catch (error) {
    console.error("[POST /api/tooling/sync]", error);
    return NextResponse.json(
      { error: "Failed to sync tooling from disk" },
      { status: 500 }
    );
  }
}
