/**
 * Import historical metrics: new students (with revenue), churn events (Dec 2025, Jan 2026),
 * and update existing records with correct revenue and status.
 *
 * Run with: npx tsx scripts/import-metrics.ts
 */

import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const dbPath = path.resolve(process.cwd(), "mission-control.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// ---------------------------------------------------------------------------
// 1. Students who churned BEFORE the Feb spreadsheet import (not in DB yet)
// ---------------------------------------------------------------------------

interface NewStudent {
  name: string;
  coach: string;
  program: string;
  monthly_revenue: number;
  signup_date: string;
  status: string;
  notes: string;
}

const missingChurnedStudents: NewStudent[] = [
  // December cancels
  { name: "Kap Chatfield", coach: "Nathan", program: "accelerator", monthly_revenue: 750, signup_date: "2025-06-01", status: "cancelled", notes: "Cancelled Dec 2025 - Not Active" },
  { name: "Tony Spore", coach: "Caleb", program: "accelerator", monthly_revenue: 1000, signup_date: "2025-06-01", status: "cancelled", notes: "Cancelled Dec 2025 - Financial" },
  { name: "Quinn Curtis", coach: "Caleb", program: "accelerator", monthly_revenue: 1500, signup_date: "2025-06-01", status: "cancelled", notes: "Cancelled Dec 2025 - Time" },
  { name: "Jeff Meszaros", coach: "Caleb", program: "accelerator", monthly_revenue: 1500, signup_date: "2025-06-01", status: "cancelled", notes: "Cancelled Dec 2025 - Personal Situation" },
  { name: "Deborah Beaman", coach: "Sam", program: "accelerator", monthly_revenue: 1500, signup_date: "2025-06-01", status: "cancelled", notes: "Cancelled Dec 2025 - Switch to TikTok" },
  { name: "Yoichi Hyuga", coach: "Melody", program: "accelerator", monthly_revenue: 1000, signup_date: "2025-06-01", status: "cancelled", notes: "Cancelled Dec 2025 - Financial" },
  { name: "Drew Belnap", coach: "Alex", program: "accelerator", monthly_revenue: 3000, signup_date: "2025-06-01", status: "cancelled", notes: "Refund Dec 2025 - Personal Situation" },
  { name: "Donald Bucolo", coach: "Nathan", program: "accelerator", monthly_revenue: 750, signup_date: "2025-06-01", status: "downgraded", notes: "Downgraded Dec 2025 - Not Active" },
  // January cancels
  { name: "Kristina Smedley", coach: "Nathan", program: "accelerator", monthly_revenue: 833.33, signup_date: "2025-06-01", status: "cancelled", notes: "Cancelled Jan 2026 - Not Active" },
  { name: "Daniel Kafer", coach: "Nathan", program: "accelerator", monthly_revenue: 750, signup_date: "2025-06-01", status: "cancelled", notes: "Cancelled Jan 2026 - Not Active" },
  { name: "Barrett Taylor", coach: "Sam", program: "accelerator", monthly_revenue: 1000, signup_date: "2025-06-01", status: "cancelled", notes: "Cancelled Jan 2026 - Financial / Planned" },
  { name: "Joey Frederick", coach: "Caleb", program: "accelerator", monthly_revenue: 1500, signup_date: "2025-06-01", status: "cancelled", notes: "Cancelled Jan 2026 - Financial" },
  { name: "Sally Beach", coach: "Melody", program: "accelerator", monthly_revenue: 1000, signup_date: "2025-06-01", status: "downgraded", notes: "Downgraded Jan 2026 - Financial / Planned" },
];

// ---------------------------------------------------------------------------
// 2. Revenue updates for NEW students (already in DB from spreadsheet import)
// ---------------------------------------------------------------------------

interface RevenueUpdate {
  name: string;
  monthly_revenue: number;
  notes?: string; // payment terms info
}

const revenueUpdates: RevenueUpdate[] = [
  // December 2025 new students
  { name: "Stacy Paulson", monthly_revenue: 1250, notes: "Annual 3 Pay" },
  { name: "Taylor Castleberry", monthly_revenue: 1500, notes: "Monthly" },
  { name: "Monisha Bhanote", monthly_revenue: 1165.42, notes: "Annual" },
  { name: "Mandy Cheung", monthly_revenue: 1333.33, notes: "90 Day" },
  { name: "Carrie Barnard", monthly_revenue: 1250, notes: "Annual" },
  // January 2026 new students
  { name: "Cara Alexander", monthly_revenue: 1500, notes: "Monthly" },
  { name: "Lora Freeman", monthly_revenue: 1500, notes: "Monthly" },
  { name: "Cortney Craven", monthly_revenue: 1500, notes: "Monthly" },
  { name: "Dennis Wilborn", monthly_revenue: 1500, notes: "Monthly" },
  { name: "Carmin Russell", monthly_revenue: 1500, notes: "Monthly" },
  { name: "Mish Lim", monthly_revenue: 1500, notes: "Monthly" },
  { name: "Stephen Barnes", monthly_revenue: 1250, notes: "Annual 3 Pay" },
  { name: "Brooke Fay", monthly_revenue: 1333, notes: "Quarterly" }, // DB has "Brooke Fay"
  { name: "Yulin Lee", monthly_revenue: 1500, notes: "Monthly" },
  { name: "Michael Musgrove", monthly_revenue: 1250, notes: "Annual 3 Pay" },
  { name: "Rey Martinez", monthly_revenue: 1500, notes: "Monthly" },
  { name: "Shereen Yanni", monthly_revenue: 1000, notes: "Monthly" },
  { name: "Hayden Pedersen", monthly_revenue: 1500, notes: "Monthly" },
  // February 2026 new students
  { name: "Chris Little", monthly_revenue: 1500, notes: "Monthly" },
  { name: "Andrea Grassi", monthly_revenue: 1333, notes: "Quarterly" },
  { name: "Meredith Walker", monthly_revenue: 1500, notes: "Monthly" },
  { name: "Martin Lesperance", monthly_revenue: 1500, notes: "Monthly" },
  { name: "Dean-O Lies", monthly_revenue: 1500, notes: "Monthly" },
  { name: "Stacey Obyrne", monthly_revenue: 1250, notes: "Annual 3 Pay" },
  { name: "Agness Mumbi", monthly_revenue: 1500, notes: "Monthly" },
  // Churned students already in DB - update their revenue too
  { name: "Erik Taniguchi", monthly_revenue: 1000 },
  { name: "David Saenz", monthly_revenue: 1000 },
  { name: "Spencer Dunbar", monthly_revenue: 1000 },
  { name: "Joey Hudson", monthly_revenue: 1500 },
  { name: "Nicholas Meissner", monthly_revenue: 800 },
  { name: "Meghan Garcia-Webb", monthly_revenue: 1500 },
  { name: "John Griffin", monthly_revenue: 1166.67 },
  { name: "Hernando Thola", monthly_revenue: 1500 },
];

// ---------------------------------------------------------------------------
// 3. ALL churn events (Dec 2025 + Jan 2026) - Feb already exists
// ---------------------------------------------------------------------------

interface ChurnEvent {
  student_name: string;
  event_type: "cancel" | "downgrade" | "pause";
  event_date: string;
  coach: string;
  monthly_revenue_impact: number;
  reason: string;
}

const churnEvents: ChurnEvent[] = [
  // December 2025
  { student_name: "Kap Chatfield", event_type: "cancel", event_date: "2025-12-01", coach: "Nathan", monthly_revenue_impact: 750, reason: "Not Active" },
  { student_name: "Tony Spore", event_type: "cancel", event_date: "2025-12-01", coach: "Caleb", monthly_revenue_impact: 1000, reason: "Financial" },
  { student_name: "Quinn Curtis", event_type: "cancel", event_date: "2025-12-01", coach: "Caleb", monthly_revenue_impact: 1500, reason: "Time" },
  { student_name: "Jeff Meszaros", event_type: "cancel", event_date: "2025-12-01", coach: "Caleb", monthly_revenue_impact: 1500, reason: "Personal Situation" },
  { student_name: "Deborah Beaman", event_type: "cancel", event_date: "2025-12-01", coach: "Sam", monthly_revenue_impact: 1500, reason: "Switch to TikTok" },
  { student_name: "Yoichi Hyuga", event_type: "cancel", event_date: "2025-12-01", coach: "Melody", monthly_revenue_impact: 1000, reason: "Financial" },
  { student_name: "Drew Belnap", event_type: "cancel", event_date: "2025-12-01", coach: "Alex", monthly_revenue_impact: 3000, reason: "Refund - Personal Situation" },
  { student_name: "Nicholas Meissner", event_type: "pause", event_date: "2025-12-01", coach: "Nathan", monthly_revenue_impact: 800, reason: "Pause until Nathan's back" },
  { student_name: "Donald Bucolo", event_type: "downgrade", event_date: "2025-12-01", coach: "Nathan", monthly_revenue_impact: 750, reason: "Not Active" },
  // January 2026
  { student_name: "Erik Taniguchi", event_type: "cancel", event_date: "2026-01-01", coach: "Alex", monthly_revenue_impact: 1000, reason: "Financial" },
  { student_name: "Kristina Smedley", event_type: "cancel", event_date: "2026-01-01", coach: "Nathan", monthly_revenue_impact: 833.33, reason: "Not Active" },
  { student_name: "Daniel Kafer", event_type: "cancel", event_date: "2026-01-01", coach: "Nathan", monthly_revenue_impact: 750, reason: "Not Active" },
  { student_name: "Barrett Taylor", event_type: "cancel", event_date: "2026-01-01", coach: "Sam", monthly_revenue_impact: 1000, reason: "Financial / Planned" },
  { student_name: "Joey Frederick", event_type: "cancel", event_date: "2026-01-01", coach: "Caleb", monthly_revenue_impact: 1500, reason: "Financial" },
  { student_name: "David Saenz", event_type: "pause", event_date: "2026-01-01", coach: "Sam", monthly_revenue_impact: 1000, reason: "Uncertain" },
  { student_name: "Sally Beach", event_type: "downgrade", event_date: "2026-01-01", coach: "Melody", monthly_revenue_impact: 1000, reason: "Financial / Planned" },
  { student_name: "Spencer Dunbar", event_type: "cancel", event_date: "2026-01-01", coach: "Caleb", monthly_revenue_impact: 1000, reason: "" },
  { student_name: "Joey Hudson", event_type: "pause", event_date: "2026-01-01", coach: "Caleb", monthly_revenue_impact: 1500, reason: "Undecided" },
];

// ---------------------------------------------------------------------------
// 4. Status corrections
// ---------------------------------------------------------------------------

// Spencer Dunbar: currently "active" in DB but cancelled in January
// Nicholas Meissner: paused in Dec but active in Feb spreadsheet (resumed)
// → keep as active (the pause was temporary)

const statusFixes: { name: string; status: string }[] = [
  { name: "Spencer Dunbar", status: "cancelled" },
  // Nicholas Meissner stays active - he resumed after the Dec pause
];

// ---------------------------------------------------------------------------
// 5. Update existing Feb churn events with correct revenue & coach
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// EXECUTE
// ---------------------------------------------------------------------------

const insertStudent = db.prepare(
  `INSERT INTO students (id, name, email, youtube_channel, coach, program, monthly_revenue, signup_date, status, notes)
   VALUES (?, ?, '', '', ?, ?, ?, ?, ?, ?)`
);

const updateRevenue = db.prepare(
  `UPDATE students SET monthly_revenue = ?, updated_at = datetime('now') WHERE name = ?`
);

const updateRevenueAndNotes = db.prepare(
  `UPDATE students SET monthly_revenue = ?, notes = CASE WHEN notes = '' THEN ? ELSE notes || ' | ' || ? END, updated_at = datetime('now') WHERE name = ?`
);

const insertChurn = db.prepare(
  `INSERT INTO churn_events (id, student_id, event_type, event_date, reason, monthly_revenue_impact, coach, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?, '')`
);

const updateStatus = db.prepare(
  `UPDATE students SET status = ?, updated_at = datetime('now') WHERE name = ?`
);

const findStudent = db.prepare(
  `SELECT id, name FROM students WHERE name = ?`
);

const updateChurnRevenue = db.prepare(
  `UPDATE churn_events SET monthly_revenue_impact = ?, coach = ? WHERE student_id = ? AND event_type = ?`
);

let addedStudents = 0;
let updatedRevenues = 0;
let addedChurnEvents = 0;
let fixedStatuses = 0;

db.transaction(() => {
  // Step 1: Add missing churned students
  console.log("\n--- Adding missing churned students ---");
  for (const s of missingChurnedStudents) {
    const existing = findStudent.get(s.name) as { id: string; name: string } | undefined;
    if (existing) {
      console.log(`  SKIP (exists): ${s.name}`);
      continue;
    }
    const id = uuidv4();
    insertStudent.run(id, s.name, s.coach, s.program, s.monthly_revenue, s.signup_date, s.status, s.notes);
    console.log(`  ADDED: ${s.name} [${s.status}]`);
    addedStudents++;
  }

  // Step 2: Update revenue for known students
  console.log("\n--- Updating monthly revenue ---");
  for (const r of revenueUpdates) {
    const existing = findStudent.get(r.name) as { id: string; name: string } | undefined;
    if (!existing) {
      console.log(`  NOT FOUND: ${r.name}`);
      continue;
    }
    if (r.notes) {
      const termsNote = `Terms: ${r.notes}`;
      updateRevenueAndNotes.run(r.monthly_revenue, termsNote, termsNote, r.name);
    } else {
      updateRevenue.run(r.monthly_revenue, r.name);
    }
    console.log(`  UPDATED: ${r.name} → $${r.monthly_revenue}`);
    updatedRevenues++;
  }

  // Step 3: Add Dec + Jan churn events
  console.log("\n--- Adding churn events ---");
  for (const e of churnEvents) {
    const student = findStudent.get(e.student_name) as { id: string; name: string } | undefined;
    if (!student) {
      console.log(`  STUDENT NOT FOUND: ${e.student_name}`);
      continue;
    }
    const id = uuidv4();
    insertChurn.run(id, student.id, e.event_type, e.event_date, e.reason, e.monthly_revenue_impact, e.coach);
    console.log(`  ADDED: ${e.student_name} [${e.event_type}] ${e.event_date} ($${e.monthly_revenue_impact})`);
    addedChurnEvents++;
  }

  // Step 4: Fix statuses
  console.log("\n--- Fixing statuses ---");
  for (const f of statusFixes) {
    updateStatus.run(f.status, f.name);
    console.log(`  FIXED: ${f.name} → ${f.status}`);
    fixedStatuses++;
  }

  // Step 5: Update existing Feb churn events with revenue & coach
  console.log("\n--- Updating Feb churn events with revenue ---");
  const meghan = findStudent.get("Meghan Garcia-Webb") as { id: string } | undefined;
  if (meghan) {
    updateChurnRevenue.run(1500, "Sam", meghan.id, "cancel");
    console.log("  UPDATED: Meghan Garcia-Webb → $1,500 (Sam)");
  }
  const john = findStudent.get("John Griffin") as { id: string } | undefined;
  if (john) {
    updateChurnRevenue.run(1166.67, "Alex", john.id, "cancel");
    console.log("  UPDATED: John Griffin → $1,166.67 (Alex)");
  }
  const hernando = findStudent.get("Hernando Thola") as { id: string } | undefined;
  if (hernando) {
    updateChurnRevenue.run(1500, "Caleb", hernando.id, "downgrade");
    console.log("  UPDATED: Hernando Thola → $1,500 (Caleb)");
  }
})();

console.log("\n=== SUMMARY ===");
console.log(`  Students added:       ${addedStudents}`);
console.log(`  Revenues updated:     ${updatedRevenues}`);
console.log(`  Churn events added:   ${addedChurnEvents}`);
console.log(`  Statuses fixed:       ${fixedStatuses}`);

// Verify counts
const totalStudents = (db.prepare("SELECT COUNT(*) as count FROM students").get() as { count: number }).count;
const activeStudents = (db.prepare("SELECT COUNT(*) as count FROM students WHERE status = 'active'").get() as { count: number }).count;
const totalChurn = (db.prepare("SELECT COUNT(*) as count FROM churn_events").get() as { count: number }).count;

console.log(`\n  Total students:       ${totalStudents}`);
console.log(`  Active students:      ${activeStudents}`);
console.log(`  Total churn events:   ${totalChurn}`);

db.close();
