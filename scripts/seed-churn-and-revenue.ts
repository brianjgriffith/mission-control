import { getDb } from '../src/lib/db';
import { v4 as uuidv4 } from 'uuid';

const db = getDb();

// ============================================================================
// 1. Update monthly_revenue for new students (from the New Students sheets)
// ============================================================================

const revenueUpdates: { name: string; monthly_revenue: number }[] = [
  // December new students
  { name: "Stacy Paulson", monthly_revenue: 1250 },
  { name: "Taylor Castleberry", monthly_revenue: 1500 },
  { name: "Monisha Bhanote", monthly_revenue: 1165.42 },
  { name: "Mandy Cheung", monthly_revenue: 1333.33 },
  { name: "Carrie Barnard", monthly_revenue: 1250 },
  // January new students
  { name: "Cara Alexander", monthly_revenue: 1500 },
  { name: "Lora Freeman", monthly_revenue: 1500 },
  { name: "Cortney Craven", monthly_revenue: 1500 },
  { name: "Dennis Wilborn", monthly_revenue: 1500 },
  { name: "Carmin Russell", monthly_revenue: 1500 },
  { name: "Mish Lim", monthly_revenue: 1500 },
  { name: "Stephen Barnes", monthly_revenue: 1250 },
  { name: "Brooke Fay", monthly_revenue: 1333 },
  { name: "Yulin Lee", monthly_revenue: 1500 },
  { name: "Michael Musgrove", monthly_revenue: 1250 },
  { name: "Rey Martinez", monthly_revenue: 1500 },
  { name: "Shereen Yanni", monthly_revenue: 1000 },
  { name: "Hayden Pedersen", monthly_revenue: 1500 },
  // February new students
  { name: "Chris Little", monthly_revenue: 1500 },
  { name: "Andrea Grassi", monthly_revenue: 1333 },
  { name: "Meredith Walker", monthly_revenue: 1500 },
  { name: "Martin Lesperance", monthly_revenue: 1500 },
  { name: "Dean-O Lies", monthly_revenue: 1500 },
  { name: "Stacey Obyrne", monthly_revenue: 1250 },
  { name: "Agness Mumbi", monthly_revenue: 1500 },
];

console.log("--- Updating monthly_revenue for new students ---");
const updateRevenue = db.prepare(
  "UPDATE students SET monthly_revenue = ?, updated_at = datetime('now') WHERE name = ?"
);
for (const u of revenueUpdates) {
  const result = updateRevenue.run(u.monthly_revenue, u.name);
  if (result.changes > 0) {
    console.log(`  Updated ${u.name}: $${u.monthly_revenue}`);
  } else {
    console.log(`  WARNING: Student not found: ${u.name}`);
  }
}

// ============================================================================
// 2. Add churned students who weren't in the accelerator Excel export
//    (they were already cancelled/gone before the export)
// ============================================================================

interface MissingStudent {
  name: string;
  coach: string;
  monthly_revenue: number;
  status: string;
  signup_date: string; // approximate
}

const missingStudents: MissingStudent[] = [
  // December churn — these students were already gone
  { name: "Kap Chatfield", coach: "Nathan", monthly_revenue: 750, status: "cancelled", signup_date: "2025-06-01" },
  { name: "Tony Spore", coach: "Caleb", monthly_revenue: 1000, status: "cancelled", signup_date: "2025-06-01" },
  { name: "Quinn Curtis", coach: "Caleb", monthly_revenue: 1500, status: "cancelled", signup_date: "2025-06-01" },
  { name: "Jeff Meszaros", coach: "Caleb", monthly_revenue: 1500, status: "cancelled", signup_date: "2025-06-01" },
  { name: "Deborah Beaman", coach: "Sam", monthly_revenue: 1500, status: "cancelled", signup_date: "2025-06-01" },
  { name: "Yoichi Hyuga", coach: "Melody", monthly_revenue: 1000, status: "cancelled", signup_date: "2025-06-01" },
  { name: "Drew Belnap", coach: "Alex", monthly_revenue: 3000, status: "cancelled", signup_date: "2025-06-01" },
  { name: "Donald Bucolo", coach: "Nathan", monthly_revenue: 750, status: "downgraded", signup_date: "2025-06-01" },
  // January churn — missing from export
  { name: "Kristina Smedley", coach: "Nathan", monthly_revenue: 833.33, status: "cancelled", signup_date: "2025-06-01" },
  { name: "Daniel Kafer", coach: "Nathan", monthly_revenue: 750, status: "cancelled", signup_date: "2025-06-01" },
  { name: "Barrett Taylor", coach: "Sam", monthly_revenue: 1000, status: "cancelled", signup_date: "2025-06-01" },
  { name: "Joey Frederick", coach: "Caleb", monthly_revenue: 1500, status: "cancelled", signup_date: "2025-06-01" },
  { name: "Sally Beach", coach: "Melody", monthly_revenue: 1000, status: "downgraded", signup_date: "2025-06-01" },
];

console.log("\n--- Adding missing churned students ---");
const checkStudent = db.prepare("SELECT id FROM students WHERE name = ?");
const insertStudent = db.prepare(
  `INSERT INTO students (id, name, email, youtube_channel, coach, program, monthly_revenue, signup_date, status, payment_plan, renewal_date, notes)
   VALUES (?, ?, '', '', ?, 'accelerator', ?, ?, ?, '', '', '')`
);

for (const s of missingStudents) {
  const existing = checkStudent.get(s.name) as { id: string } | undefined;
  if (existing) {
    console.log(`  Already exists: ${s.name}`);
  } else {
    insertStudent.run(uuidv4(), s.name, s.coach, s.monthly_revenue, s.signup_date, s.status);
    console.log(`  Added: ${s.name} (${s.status})`);
  }
}

// Also update Nicholas Meissner's monthly_revenue
updateRevenue.run(800, "Nicholas Meissner");
console.log("  Updated Nicholas Meissner: $800");

// ============================================================================
// 3. Create all churn events
// ============================================================================

console.log("\n--- Creating churn events ---");

// Check if churn events already exist
const churnCount = db.prepare("SELECT COUNT(*) as cnt FROM churn_events").get() as { cnt: number };
if (churnCount.cnt > 0) {
  console.log(`  Already have ${churnCount.cnt} churn events. Skipping.`);
} else {
  interface ChurnEntry {
    student_name: string;
    event_type: string; // cancel | pause | downgrade | restart
    event_date: string;
    monthly_revenue_impact: number;
    coach: string;
    reason: string;
  }

  const churnEvents: ChurnEntry[] = [
    // === DECEMBER CHURN ===
    { student_name: "Kap Chatfield", event_type: "cancel", event_date: "2025-12-01", monthly_revenue_impact: 750, coach: "Nathan", reason: "Not Active" },
    { student_name: "Tony Spore", event_type: "cancel", event_date: "2025-12-01", monthly_revenue_impact: 1000, coach: "Caleb", reason: "Financial" },
    { student_name: "Quinn Curtis", event_type: "cancel", event_date: "2025-12-01", monthly_revenue_impact: 1500, coach: "Caleb", reason: "Time" },
    { student_name: "Jeff Meszaros", event_type: "cancel", event_date: "2025-12-01", monthly_revenue_impact: 1500, coach: "Caleb", reason: "Personal Situation" },
    { student_name: "Deborah Beaman", event_type: "cancel", event_date: "2025-12-01", monthly_revenue_impact: 1500, coach: "Sam", reason: "Switch to TikTok" },
    { student_name: "Yoichi Hyuga", event_type: "cancel", event_date: "2025-12-01", monthly_revenue_impact: 1000, coach: "Melody", reason: "Financial" },
    { student_name: "Drew Belnap", event_type: "cancel", event_date: "2025-12-01", monthly_revenue_impact: 3000, coach: "Alex", reason: "Refund - Personal Situation" },
    { student_name: "Nicholas Meissner", event_type: "pause", event_date: "2025-12-01", monthly_revenue_impact: 800, coach: "Nathan", reason: "Pause until Nathan's back" },
    { student_name: "Donald Bucolo", event_type: "downgrade", event_date: "2025-12-01", monthly_revenue_impact: 750, coach: "Nathan", reason: "Not Active" },

    // === JANUARY CHURN ===
    { student_name: "Erik Taniguchi", event_type: "cancel", event_date: "2026-01-01", monthly_revenue_impact: 1000, coach: "Alex", reason: "Financial" },
    { student_name: "Kristina Smedley", event_type: "cancel", event_date: "2026-01-01", monthly_revenue_impact: 833.33, coach: "Nathan", reason: "Not Active" },
    { student_name: "Daniel Kafer", event_type: "cancel", event_date: "2026-01-01", monthly_revenue_impact: 750, coach: "Nathan", reason: "Not Active" },
    { student_name: "Barrett Taylor", event_type: "cancel", event_date: "2026-01-01", monthly_revenue_impact: 1000, coach: "Sam", reason: "Financial / Planned" },
    { student_name: "Joey Frederick", event_type: "cancel", event_date: "2026-01-01", monthly_revenue_impact: 1500, coach: "Caleb", reason: "Financial" },
    { student_name: "David Saenz", event_type: "pause", event_date: "2026-01-01", monthly_revenue_impact: 1000, coach: "Sam", reason: "Uncertain" },
    { student_name: "Sally Beach", event_type: "downgrade", event_date: "2026-01-01", monthly_revenue_impact: 1000, coach: "Melody", reason: "Financial / Planned" },
    { student_name: "Spencer Dunbar", event_type: "cancel", event_date: "2026-01-01", monthly_revenue_impact: 1000, coach: "Caleb", reason: "" },
    { student_name: "Joey Hudson", event_type: "pause", event_date: "2026-01-01", monthly_revenue_impact: 1500, coach: "Caleb", reason: "Undecided" },

    // === FEBRUARY CHURN ===
    { student_name: "Meghan Garcia-Webb", event_type: "cancel", event_date: "2026-02-01", monthly_revenue_impact: 1500, coach: "Sam", reason: "" },
    { student_name: "John Griffin", event_type: "cancel", event_date: "2026-02-01", monthly_revenue_impact: 1166.67, coach: "Alex", reason: "" },
    { student_name: "Hernando Thola", event_type: "downgrade", event_date: "2026-02-01", monthly_revenue_impact: 1500, coach: "Caleb", reason: "" },

    // === FEBRUARY RESTART ===
    { student_name: "Nicholas Meissner", event_type: "restart", event_date: "2026-02-01", monthly_revenue_impact: 800, coach: "Nathan", reason: "Restarted after pause" },
  ];

  const getStudentId = db.prepare("SELECT id FROM students WHERE name = ?");
  const insertChurn = db.prepare(
    `INSERT INTO churn_events (id, student_id, event_type, event_date, reason, monthly_revenue_impact, coach, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, '')`
  );

  const seedChurn = db.transaction(() => {
    for (const e of churnEvents) {
      const student = getStudentId.get(e.student_name) as { id: string } | undefined;
      if (!student) {
        console.log(`  WARNING: Student not found for churn: ${e.student_name}`);
        continue;
      }
      insertChurn.run(uuidv4(), student.id, e.event_type, e.event_date, e.reason, e.monthly_revenue_impact, e.coach);
      console.log(`  ${e.event_date} ${e.event_type.padEnd(10)} ${e.student_name} ($${e.monthly_revenue_impact})`);
    }
  });

  seedChurn();
}

// ============================================================================
// 4. Fix Nicholas Meissner's status — he restarted in Feb, so he's active now
// ============================================================================

console.log("\n--- Fixing Nicholas Meissner status to active (restarted) ---");
// The name in the Excel was "Nicholas Meissner" but let's check both spellings
const nickResult = db.prepare(
  "UPDATE students SET status = 'active', updated_at = datetime('now') WHERE name LIKE 'Nicholas Mei%'"
).run();
console.log(`  Updated ${nickResult.changes} row(s)`);

// ============================================================================
// 5. Summary
// ============================================================================

console.log("\n=== SUMMARY ===");

const totalStudents = db.prepare("SELECT COUNT(*) as cnt FROM students").get() as { cnt: number };
const activeStudents = db.prepare("SELECT COUNT(*) as cnt FROM students WHERE status = 'active'").get() as { cnt: number };
const totalChurn = db.prepare("SELECT COUNT(*) as cnt FROM churn_events").get() as { cnt: number };

console.log(`Total students: ${totalStudents.cnt}`);
console.log(`Active students: ${activeStudents.cnt}`);
console.log(`Churn events: ${totalChurn.cnt}`);

const byCoach = db.prepare(
  `SELECT coach, COUNT(*) as cnt, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
   FROM students WHERE coach != '' GROUP BY coach ORDER BY active DESC`
).all() as { coach: string; cnt: number; active: number }[];

console.log("\nBy coach (active/total):");
for (const c of byCoach) {
  console.log(`  ${c.coach}: ${c.active}/${c.cnt}`);
}

const churnByMonth = db.prepare(
  `SELECT substr(event_date, 1, 7) as month,
          SUM(CASE WHEN event_type IN ('cancel','downgrade','pause') THEN 1 ELSE 0 END) as churn_count,
          SUM(CASE WHEN event_type = 'restart' THEN 1 ELSE 0 END) as restart_count
   FROM churn_events GROUP BY month ORDER BY month`
).all() as { month: string; churn_count: number; restart_count: number }[];

console.log("\nChurn by month:");
for (const m of churnByMonth) {
  const restartNote = m.restart_count > 0 ? ` (+${m.restart_count} restart)` : "";
  console.log(`  ${m.month}: ${m.churn_count} churned${restartNote}`);
}

// Monthly starting counts for reference
console.log("\nExpected monthly starting counts (from user):");
console.log("  Dec 1: 64 students");
console.log("  Jan 1: 61 students");
console.log("  Feb 1: 63 students");
