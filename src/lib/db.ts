import Database from "better-sqlite3";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { format, lastDayOfMonth, addWeeks, getDay } from "date-fns";

// ---------------------------------------------------------------------------
// DB-layer types (use number for archived, matching SQLite storage)
// ---------------------------------------------------------------------------

export interface KanbanCard {
  id: string;
  title: string;
  description: string;
  column_id: string;
  priority: string;
  category: string;
  project_id: string | null;
  due_date: string | null;
  roadmap_id: string | null;
  sort_order: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  icon: string;
  project_type: string;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AssetRow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  url: string;
  asset_type: string;
  status: string;
  performance_notes: string;
  screenshot_url: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AssetLinkRow {
  id: string;
  asset_id: string;
  card_id: string;
  created_at: string;
}

export interface ToolingMetadataRow {
  id: string;
  asset_id: string;
  repo_path: string;
  usage_frequency: string;
  last_used_at: string | null;
  optimization_notes: string;
  dependencies: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface FinancialEntryRow {
  id: string;
  project_id: string | null;
  entry_type: string;
  amount: number;
  description: string;
  category: string;
  entry_date: string;
  recurring: number;
  created_at: string;
  updated_at: string;
}

export interface RevenueSnapshotRow {
  id: string;
  product_name: string;
  month: string; // YYYY-MM
  amount: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetTargetRow {
  id: string;
  month: string; // YYYY-MM
  target_income: number;
  target_expense: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface RepSaleRow {
  id: string;
  rep_name: string;
  month: string; // YYYY-MM
  product: string; // 'elite' | 'accelerator' | etc.
  amount: number;
  new_amount: number;
  recurring_amount: number;
  deal_count: number;
  booked_calls: number;
  refund_amount: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarEventRow {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string | null;
  event_type: string;
  color: string;
  all_day: number; // SQLite integer
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentRow {
  id: string;
  name: string;
  email: string;
  youtube_channel: string;
  coach: string;
  program: string; // 'elite' | 'accelerator'
  monthly_revenue: number;
  signup_date: string;
  status: string; // 'active' | 'cancelled' | 'paused' | 'downgraded'
  payment_plan: string;
  renewal_date: string;
  notes: string;
  switch_requested_to: string;
  switch_requested_date: string;
  created_at: string;
  updated_at: string;
}

export interface ChurnEventRow {
  id: string;
  student_id: string;
  event_type: string; // 'cancel' | 'downgrade' | 'pause'
  event_date: string;
  reason: string;
  monthly_revenue_impact: number;
  coach: string;
  notes: string;
  created_at: string;
}

export interface EliteSessionRow {
  id: string;
  title: string;
  session_type: string; // 'workshop' | 'mastermind'
  session_date: string;
  facilitator: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface EliteAttendanceRow {
  id: string;
  session_id: string;
  student_id: string;
  attended: number; // SQLite integer boolean
  notes: string;
  created_at: string;
}

export interface CoachCapacityRow {
  id: string;
  coach_name: string;
  max_students: number;
  preferred_max: number;
  status: string; // 'active' | 'limited' | 'inactive'
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface ActivityLogEntry {
  id: string;
  card_id: string | null;
  asset_id: string | null;
  project_id: string | null;
  action: string;
  details: string;
  created_at: string;
}

export interface ActivityLogWithCard extends ActivityLogEntry {
  card_title: string | null;
}

// ---------------------------------------------------------------------------
// SQL - table creation
// ---------------------------------------------------------------------------

const CREATE_KANBAN_CARDS = `
CREATE TABLE IF NOT EXISTS kanban_cards (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  column_id   TEXT NOT NULL DEFAULT 'inbox',
  priority    TEXT NOT NULL DEFAULT 'p3',
  category    TEXT DEFAULT '',
  project_id  TEXT,
  due_date    TEXT,
  roadmap_id  TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_CATEGORIES = `
CREATE TABLE IF NOT EXISTS categories (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  icon  TEXT DEFAULT ''
);
`;

const CREATE_ACTIVITY_LOG = `
CREATE TABLE IF NOT EXISTS activity_log (
  id         TEXT PRIMARY KEY,
  card_id    TEXT,
  asset_id   TEXT,
  project_id TEXT,
  action     TEXT NOT NULL,
  details    TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_PROJECTS = `
CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT DEFAULT '',
  color         TEXT NOT NULL DEFAULT '#6366f1',
  icon          TEXT DEFAULT '',
  project_type  TEXT NOT NULL DEFAULT 'client',
  status        TEXT NOT NULL DEFAULT 'active',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_ASSETS = `
CREATE TABLE IF NOT EXISTS assets (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT DEFAULT '',
  url               TEXT DEFAULT '',
  asset_type        TEXT NOT NULL DEFAULT 'page',
  status            TEXT NOT NULL DEFAULT 'draft',
  performance_notes TEXT DEFAULT '',
  screenshot_url    TEXT DEFAULT '',
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_ASSET_LINKS = `
CREATE TABLE IF NOT EXISTS asset_links (
  id         TEXT PRIMARY KEY,
  asset_id   TEXT NOT NULL,
  card_id    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(asset_id, card_id)
);
`;

const CREATE_TOOLING_METADATA = `
CREATE TABLE IF NOT EXISTS tooling_metadata (
  id                 TEXT PRIMARY KEY,
  asset_id           TEXT NOT NULL UNIQUE,
  repo_path          TEXT DEFAULT '',
  usage_frequency    TEXT DEFAULT 'unknown',
  last_used_at       TEXT,
  optimization_notes TEXT DEFAULT '',
  dependencies       TEXT DEFAULT '[]',
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_REVENUE_SNAPSHOTS = `
CREATE TABLE IF NOT EXISTS revenue_snapshots (
  id            TEXT PRIMARY KEY,
  product_name  TEXT NOT NULL,
  month         TEXT NOT NULL,
  amount        REAL NOT NULL DEFAULT 0,
  notes         TEXT DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_name, month)
);
`;

const CREATE_FINANCIAL_ENTRIES = `
CREATE TABLE IF NOT EXISTS financial_entries (
  id          TEXT PRIMARY KEY,
  project_id  TEXT,
  entry_type  TEXT NOT NULL DEFAULT 'income',
  amount      REAL NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  category    TEXT DEFAULT '',
  entry_date  TEXT NOT NULL DEFAULT (date('now')),
  recurring   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_BUDGET_TARGETS = `
CREATE TABLE IF NOT EXISTS budget_targets (
  id              TEXT PRIMARY KEY,
  month           TEXT NOT NULL,
  target_income   REAL NOT NULL DEFAULT 0,
  target_expense  REAL NOT NULL DEFAULT 0,
  notes           TEXT DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(month)
);
`;

const CREATE_REP_SALES = `
CREATE TABLE IF NOT EXISTS rep_sales (
  id               TEXT PRIMARY KEY,
  rep_name         TEXT NOT NULL,
  month            TEXT NOT NULL,
  product          TEXT NOT NULL DEFAULT 'accelerator',
  amount           REAL NOT NULL DEFAULT 0,
  new_amount       REAL NOT NULL DEFAULT 0,
  recurring_amount REAL NOT NULL DEFAULT 0,
  refund_amount    REAL NOT NULL DEFAULT 0,
  deal_count       INTEGER NOT NULL DEFAULT 0,
  booked_calls     INTEGER NOT NULL DEFAULT 0,
  notes            TEXT DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(rep_name, month, product)
);
`;

const CREATE_CALENDAR_EVENTS = `
CREATE TABLE IF NOT EXISTS calendar_events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  start_date  TEXT NOT NULL,
  end_date    TEXT,
  event_type  TEXT NOT NULL DEFAULT 'custom',
  color       TEXT DEFAULT '',
  all_day     INTEGER NOT NULL DEFAULT 1,
  project_id  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_STUDENTS = `
CREATE TABLE IF NOT EXISTS students (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT DEFAULT '',
  youtube_channel TEXT DEFAULT '',
  coach           TEXT DEFAULT '',
  program         TEXT NOT NULL DEFAULT 'accelerator',
  monthly_revenue REAL NOT NULL DEFAULT 0,
  signup_date     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  payment_plan    TEXT DEFAULT '',
  renewal_date    TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_CHURN_EVENTS = `
CREATE TABLE IF NOT EXISTS churn_events (
  id                     TEXT PRIMARY KEY,
  student_id             TEXT NOT NULL,
  event_type             TEXT NOT NULL,
  event_date             TEXT NOT NULL,
  reason                 TEXT DEFAULT '',
  monthly_revenue_impact REAL NOT NULL DEFAULT 0,
  coach                  TEXT DEFAULT '',
  notes                  TEXT DEFAULT '',
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_ELITE_SESSIONS = `
CREATE TABLE IF NOT EXISTS elite_sessions (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  session_type  TEXT NOT NULL DEFAULT 'workshop',
  session_date  TEXT NOT NULL,
  facilitator   TEXT DEFAULT 'Sean',
  notes         TEXT DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_ELITE_ATTENDANCE = `
CREATE TABLE IF NOT EXISTS elite_attendance (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  attended   INTEGER NOT NULL DEFAULT 1,
  notes      TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, student_id)
);
`;

const CREATE_MARKETING_COHORTS = `
CREATE TABLE IF NOT EXISTS marketing_cohorts (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  start_date        TEXT NOT NULL,
  end_date          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'upcoming',
  enrolled          INTEGER NOT NULL DEFAULT 0,
  converted_yearly  INTEGER NOT NULL DEFAULT 0,
  converted_monthly INTEGER NOT NULL DEFAULT 0,
  coaching_upsells  INTEGER NOT NULL DEFAULT 0,
  revenue_cohort    REAL NOT NULL DEFAULT 0,
  revenue_yearly    REAL NOT NULL DEFAULT 0,
  revenue_monthly   REAL NOT NULL DEFAULT 0,
  revenue_coaching  REAL NOT NULL DEFAULT 0,
  notes             TEXT DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_MARKETING_WEB_CLASSES = `
CREATE TABLE IF NOT EXISTS marketing_web_classes (
  id                TEXT PRIMARY KEY,
  class_date        TEXT NOT NULL,
  attendees         INTEGER NOT NULL DEFAULT 0,
  signups_to_cohort INTEGER NOT NULL DEFAULT 0,
  notes             TEXT DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_CARD_TEMPLATES = `
CREATE TABLE IF NOT EXISTS card_templates (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  project_id      TEXT,
  priority        TEXT NOT NULL DEFAULT 'p3',
  category        TEXT DEFAULT '',
  recurrence      TEXT NOT NULL DEFAULT 'monthly',
  day_of_month    INTEGER DEFAULT 1,
  day_of_week     INTEGER DEFAULT 1,
  active          INTEGER NOT NULL DEFAULT 1,
  last_generated  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_MARKETING_LEADS = `
CREATE TABLE IF NOT EXISTS marketing_leads (
  id         TEXT PRIMARY KEY,
  source     TEXT NOT NULL DEFAULT 'organic',
  count      INTEGER NOT NULL DEFAULT 0,
  period     TEXT NOT NULL,
  notes      TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_REP_QUOTAS = `
CREATE TABLE IF NOT EXISTS rep_quotas (
  id            TEXT PRIMARY KEY,
  rep_name      TEXT NOT NULL,
  month         TEXT NOT NULL,
  target_amount REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(rep_name, month)
);
`;

const CREATE_DEALS = `
CREATE TABLE IF NOT EXISTS deals (
  id           TEXT PRIMARY KEY,
  rep_name     TEXT NOT NULL,
  product      TEXT NOT NULL,
  client_name  TEXT NOT NULL DEFAULT '',
  amount       REAL NOT NULL DEFAULT 0,
  deal_date    TEXT NOT NULL,
  month        TEXT NOT NULL,
  notes        TEXT DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_COACH_CAPACITY = `
CREATE TABLE IF NOT EXISTS coach_capacity (
  id            TEXT PRIMARY KEY,
  coach_name    TEXT NOT NULL,
  max_students  INTEGER NOT NULL DEFAULT 20,
  preferred_max INTEGER NOT NULL DEFAULT 17,
  status        TEXT NOT NULL DEFAULT 'active',
  notes         TEXT DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

interface DefaultCategory {
  id: string;
  name: string;
  color: string;
}

const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { id: "cat-think-media", name: "Think Media", color: "#6366f1" },
  { id: "cat-personal", name: "Personal", color: "#22c55e" },
  { id: "cat-content", name: "Content", color: "#f59e0b" },
  { id: "cat-tech", name: "Tech", color: "#3b82f6" },
  { id: "cat-finance", name: "Finance", color: "#ef4444" },
];

interface SeedProject {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  project_type: string;
  sort_order: number;
}

const SEED_PROJECTS: SeedProject[] = [
  { id: "proj-claude-tooling", name: "Claude Code & AI Tooling", slug: "claude-tooling", color: "#3b82f6", icon: "Bot", project_type: "tooling", sort_order: 0 },
  { id: "proj-think-media", name: "Think Media Coaching", slug: "think-media", color: "#6366f1", icon: "Video", project_type: "client", sort_order: 1 },
  { id: "proj-jake-berman", name: "Jake Berman (DFY)", slug: "jake-berman", color: "#22c55e", icon: "User", project_type: "client", sort_order: 2 },
  { id: "proj-personal", name: "Personal", slug: "personal", color: "#f59e0b", icon: "Home", project_type: "internal", sort_order: 3 },
  { id: "proj-finance", name: "Finance", slug: "finance", color: "#ef4444", icon: "DollarSign", project_type: "internal", sort_order: 4 },
];

// Category name -> project ID mapping for migration
const CATEGORY_TO_PROJECT: Record<string, string> = {
  "Think Media": "proj-think-media",
  "Personal": "proj-personal",
  "Content": "proj-think-media",
  "Tech": "proj-claude-tooling",
  "Finance": "proj-finance",
};

// ---------------------------------------------------------------------------
// Federal holiday seeding
// ---------------------------------------------------------------------------

/**
 * Compute the Nth occurrence of a given weekday in a month.
 * weekday: 0 = Sunday, 1 = Monday, ... 6 = Saturday
 * n: 1-based (1st, 2nd, 3rd, 4th)
 */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  // Start from the first of the month
  const first = new Date(year, month, 1);
  const firstDow = getDay(first); // 0-6

  // Days until the first occurrence of the target weekday
  let daysUntil = weekday - firstDow;
  if (daysUntil < 0) daysUntil += 7;

  // The first occurrence date (1-based)
  const firstOccurrence = new Date(year, month, 1 + daysUntil);

  // Add (n - 1) weeks
  return addWeeks(firstOccurrence, n - 1);
}

/**
 * Compute the last occurrence of a given weekday in a month.
 */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = lastDayOfMonth(new Date(year, month, 1));
  const lastDow = getDay(last);

  let daysBack = lastDow - weekday;
  if (daysBack < 0) daysBack += 7;

  return new Date(year, month, last.getDate() - daysBack);
}

interface HolidayDef {
  name: string;
  getDate: (year: number) => Date;
}

const FEDERAL_HOLIDAYS: HolidayDef[] = [
  { name: "New Year's Day",   getDate: (y) => new Date(y, 0, 1) },
  { name: "MLK Day",          getDate: (y) => nthWeekdayOfMonth(y, 0, 1, 3) },      // 3rd Monday of Jan
  { name: "Presidents' Day",  getDate: (y) => nthWeekdayOfMonth(y, 1, 1, 3) },      // 3rd Monday of Feb
  { name: "Memorial Day",     getDate: (y) => lastWeekdayOfMonth(y, 4, 1) },         // Last Monday of May
  { name: "Juneteenth",       getDate: (y) => new Date(y, 5, 19) },
  { name: "Independence Day", getDate: (y) => new Date(y, 6, 4) },
  { name: "Labor Day",        getDate: (y) => nthWeekdayOfMonth(y, 8, 1, 1) },      // 1st Monday of Sep
  { name: "Columbus Day",     getDate: (y) => nthWeekdayOfMonth(y, 9, 1, 2) },      // 2nd Monday of Oct
  { name: "Veterans Day",     getDate: (y) => new Date(y, 10, 11) },
  { name: "Thanksgiving",     getDate: (y) => nthWeekdayOfMonth(y, 10, 4, 4) },     // 4th Thursday of Nov
  { name: "Christmas Day",    getDate: (y) => new Date(y, 11, 25) },
];

function seedFederalHolidays(db: Database.Database): void {
  const insert = db.prepare(
    `INSERT INTO calendar_events (id, title, description, start_date, end_date, event_type, color, all_day, project_id)
     VALUES (?, ?, '', ?, NULL, 'holiday', '', 1, NULL)`
  );

  const seedAll = db.transaction(() => {
    for (const year of [2025, 2026]) {
      for (const holiday of FEDERAL_HOLIDAYS) {
        const date = holiday.getDate(year);
        const dateStr = format(date, "yyyy-MM-dd");
        insert.run(uuidv4(), holiday.name, dateStr);
      }
    }
  });

  seedAll();
}

// ---------------------------------------------------------------------------
// Migration: categories -> projects
// ---------------------------------------------------------------------------

function runMigrations(db: Database.Database): void {
  const hasProjects = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
  ).get();

  if (hasProjects) return;

  db.transaction(() => {
    // Create new tables
    db.exec(CREATE_PROJECTS);
    db.exec(CREATE_ASSETS);
    db.exec(CREATE_ASSET_LINKS);
    db.exec(CREATE_TOOLING_METADATA);

    // Seed projects
    const insertProject = db.prepare(
      `INSERT INTO projects (id, name, slug, color, icon, project_type, sort_order)
       VALUES (@id, @name, @slug, @color, @icon, @project_type, @sort_order)`
    );
    for (const proj of SEED_PROJECTS) {
      insertProject.run(proj);
    }

    // Add project_id column to kanban_cards if it doesn't exist
    const cardCols = db.prepare("PRAGMA table_info(kanban_cards)").all() as { name: string }[];
    if (!cardCols.some((c) => c.name === "project_id")) {
      db.exec("ALTER TABLE kanban_cards ADD COLUMN project_id TEXT");
    }

    // Migrate existing cards: category name -> project_id
    for (const [categoryName, projectId] of Object.entries(CATEGORY_TO_PROJECT)) {
      db.prepare("UPDATE kanban_cards SET project_id = ? WHERE category = ?").run(projectId, categoryName);
    }

    // Add new columns to activity_log if needed
    const actCols = db.prepare("PRAGMA table_info(activity_log)").all() as { name: string }[];
    if (!actCols.some((c) => c.name === "asset_id")) {
      db.exec("ALTER TABLE activity_log ADD COLUMN asset_id TEXT");
    }
    if (!actCols.some((c) => c.name === "project_id")) {
      db.exec("ALTER TABLE activity_log ADD COLUMN project_id TEXT");
    }

    // Backfill project_id on existing activity entries
    db.exec(`
      UPDATE activity_log
      SET project_id = (
        SELECT k.project_id FROM kanban_cards k WHERE k.id = activity_log.card_id
      )
      WHERE card_id IS NOT NULL AND project_id IS NULL
    `);
  })();
}

// ---------------------------------------------------------------------------
// Marketing seed data (Jake Berman funnel)
// ---------------------------------------------------------------------------

function seedMarketingData(db: Database.Database): void {
  const seedAll = db.transaction(() => {
    // Seed the first completed cohort with real data
    db.prepare(`
      INSERT INTO marketing_cohorts (id, name, start_date, end_date, status, enrolled,
        converted_yearly, converted_monthly, coaching_upsells,
        revenue_cohort, revenue_yearly, revenue_monthly, revenue_coaching, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), "Cohort #1", "2026-01-20", "2026-02-16", "completed", 18,
      7, 2, 1,
      1746, 2079, 94, 297,
      "First cohort run. 18 enrolled, 7 yearly ($297 each = $2,079), 2 monthly ($47/mo = $94/mo), 1 coaching upsell ($297)."
    );

    // Seed upcoming cohort
    db.prepare(`
      INSERT INTO marketing_cohorts (id, name, start_date, end_date, status, enrolled, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), "Cohort #2", "2026-02-23", "2026-03-22", "upcoming", 0,
      "Next cohort starting after web class pitch."
    );

    // Seed recent web classes
    db.prepare(`
      INSERT INTO marketing_web_classes (id, class_date, attendees, signups_to_cohort, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), "2026-01-14", 42, 18, "First web class — great turnout. 18 signed up for Cohort #1.");

    db.prepare(`
      INSERT INTO marketing_web_classes (id, class_date, attendees, signups_to_cohort, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), "2026-02-11", 35, 0, "Second web class. Pitching Cohort #2.");

    // Seed upcoming web classes
    db.prepare(`
      INSERT INTO marketing_web_classes (id, class_date, attendees, signups_to_cohort, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), "2026-02-25", 0, 0, "Upcoming web class.");

    db.prepare(`
      INSERT INTO marketing_web_classes (id, class_date, attendees, signups_to_cohort, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), "2026-03-11", 0, 0, "Upcoming web class.");

    // Seed lead data for recent months
    db.prepare(`INSERT INTO marketing_leads (id, source, count, period, notes) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), "organic", 180, "2026-01", "Organic content leads from YouTube/social");
    db.prepare(`INSERT INTO marketing_leads (id, source, count, period, notes) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), "free_book", 45, "2026-01", "Free book downloads");
    db.prepare(`INSERT INTO marketing_leads (id, source, count, period, notes) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), "warm_up", 25, "2026-01", "Senior Golf Warm-up signups");
    db.prepare(`INSERT INTO marketing_leads (id, source, count, period, notes) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), "organic", 150, "2026-02", "February organic leads");
    db.prepare(`INSERT INTO marketing_leads (id, source, count, period, notes) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), "free_book", 38, "2026-02", "February free book downloads");
  });

  seedAll();
}

// ---------------------------------------------------------------------------
// Coach capacity seed data
// ---------------------------------------------------------------------------

function seedCoachCapacity(db: Database.Database): void {
  const insert = db.prepare(
    `INSERT INTO coach_capacity (id, coach_name, max_students, preferred_max, status, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const seedAll = db.transaction(() => {
    insert.run(uuidv4(), "Caleb", 20, 17, "active", "");
    insert.run(uuidv4(), "Sam", 18, 16, "active", "");
    insert.run(uuidv4(), "Alex", 18, 16, "active", "");
    insert.run(uuidv4(), "Melody", 16, 15, "active", "");
    insert.run(uuidv4(), "Molly", 20, 17, "active", "");
    insert.run(uuidv4(), "Nathan", 1, 1, "limited", "Transitioning out — dropping to 1 student");
  });

  seedAll();
}

// ---------------------------------------------------------------------------
// Database singleton (lazy, HMR-safe)
// ---------------------------------------------------------------------------

const GLOBAL_KEY = "__mission_control_db__" as const;

function getDbPath(): string {
  if (process.env.MISSION_CONTROL_DB_PATH) {
    return path.resolve(process.env.MISSION_CONTROL_DB_PATH);
  }
  return path.resolve(process.cwd(), "mission-control.db");
}

function createDatabase(): Database.Database {
  const dbPath = getDbPath();
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");

  // Create base tables
  db.exec(CREATE_KANBAN_CARDS);
  db.exec(CREATE_CATEGORIES);
  db.exec(CREATE_ACTIVITY_LOG);

  // Seed default categories if empty
  const count = db.prepare("SELECT COUNT(*) AS cnt FROM categories").get() as { cnt: number };
  if (count.cnt === 0) {
    const insert = db.prepare("INSERT INTO categories (id, name, color) VALUES (@id, @name, @color)");
    const seedAll = db.transaction((cats: DefaultCategory[]) => {
      for (const cat of cats) insert.run(cat);
    });
    seedAll(DEFAULT_CATEGORIES);
  }

  // Run projects migration
  runMigrations(db);

  // Create financial_entries table (idempotent)
  db.exec(CREATE_FINANCIAL_ENTRIES);

  // Create revenue_snapshots table (idempotent)
  db.exec(CREATE_REVENUE_SNAPSHOTS);

  // Create budget_targets table (idempotent)
  db.exec(CREATE_BUDGET_TARGETS);

  // Create calendar_events table (idempotent)
  db.exec(CREATE_CALENDAR_EVENTS);

  // Seed federal holidays if calendar_events table is empty
  const eventCount = db.prepare("SELECT COUNT(*) AS cnt FROM calendar_events").get() as { cnt: number };
  if (eventCount.cnt === 0) {
    seedFederalHolidays(db);
  }

  // Create rep sales table (idempotent)
  db.exec(CREATE_REP_SALES);

  // Add new_amount / recurring_amount columns to rep_sales if missing
  const repSalesCols = db.prepare("PRAGMA table_info(rep_sales)").all() as { name: string }[];
  if (!repSalesCols.some((c) => c.name === "new_amount")) {
    db.exec("ALTER TABLE rep_sales ADD COLUMN new_amount REAL NOT NULL DEFAULT 0");
  }
  if (!repSalesCols.some((c) => c.name === "recurring_amount")) {
    db.exec("ALTER TABLE rep_sales ADD COLUMN recurring_amount REAL NOT NULL DEFAULT 0");
  }
  if (!repSalesCols.some((c) => c.name === "booked_calls")) {
    db.exec("ALTER TABLE rep_sales ADD COLUMN booked_calls INTEGER NOT NULL DEFAULT 0");
  }
  if (!repSalesCols.some((c) => c.name === "refund_amount")) {
    db.exec("ALTER TABLE rep_sales ADD COLUMN refund_amount REAL NOT NULL DEFAULT 0");
  }

  // Create student tracking tables (idempotent)
  db.exec(CREATE_STUDENTS);
  db.exec(CREATE_CHURN_EVENTS);
  db.exec(CREATE_ELITE_SESSIONS);
  db.exec(CREATE_ELITE_ATTENDANCE);

  // Create card templates table (idempotent)
  db.exec(CREATE_CARD_TEMPLATES);

  // Create marketing funnel tables (idempotent)
  db.exec(CREATE_MARKETING_COHORTS);
  db.exec(CREATE_MARKETING_WEB_CLASSES);
  db.exec(CREATE_MARKETING_LEADS);

  // Seed first cohort data if marketing tables are empty
  const cohortCount = db.prepare("SELECT COUNT(*) AS cnt FROM marketing_cohorts").get() as { cnt: number };
  if (cohortCount.cnt === 0) {
    seedMarketingData(db);
  }

  // Create rep quotas table (idempotent)
  db.exec(CREATE_REP_QUOTAS);

  // Create deals table (idempotent)
  db.exec(CREATE_DEALS);

  // Create coach capacity table (idempotent)
  db.exec(CREATE_COACH_CAPACITY);

  // Seed coach capacity if empty
  const coachCapCount = db.prepare("SELECT COUNT(*) AS cnt FROM coach_capacity").get() as { cnt: number };
  if (coachCapCount.cnt === 0) {
    seedCoachCapacity(db);
  }

  // Add coach switch request columns to students if missing
  const studentCols = db.prepare("PRAGMA table_info(students)").all() as { name: string }[];
  if (!studentCols.some((c) => c.name === "switch_requested_to")) {
    db.exec("ALTER TABLE students ADD COLUMN switch_requested_to TEXT NOT NULL DEFAULT ''");
  }
  if (!studentCols.some((c) => c.name === "switch_requested_date")) {
    db.exec("ALTER TABLE students ADD COLUMN switch_requested_date TEXT NOT NULL DEFAULT ''");
  }

  return db;
}

export function getDb(): Database.Database {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = createDatabase();
  }
  return g[GLOBAL_KEY] as Database.Database;
}
