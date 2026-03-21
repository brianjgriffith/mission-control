/**
 * Migrate v1 SQLite data to Supabase.
 * Run with: npx tsx scripts/migrate-to-supabase.ts
 *
 * Migrates: students, churn_events, coach_capacity, rep_sales, calendar_events
 * Skips deprecated tables: kanban, projects, assets, marketing (Jake Berman), financials
 *
 * IMPORTANT: Run migration 002_v1_carry_forward_tables.sql in Supabase BEFORE running this script.
 */

import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const db = new Database(resolve(process.cwd(), "mission-control.db"), { readonly: true });

// Batch insert helper — Supabase has a ~1000 row limit per insert
async function batchInsert(table: string, rows: any[], batchSize = 100) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`  Error inserting into ${table} (batch ${i}):`, error.message);
      // Log the first problematic row for debugging
      if (batch.length > 0) {
        console.error(`  First row in batch:`, JSON.stringify(batch[0], null, 2));
      }
      throw error;
    }
    inserted += batch.length;
  }
  return inserted;
}

async function migrateStudents() {
  console.log("\n--- Students ---");

  const rows = db.prepare("SELECT * FROM students").all() as any[];
  console.log(`  Found ${rows.length} students in SQLite`);

  const mapped = rows.map((r) => ({
    // Use gen_random_uuid() — don't carry over SQLite UUIDs since
    // churn_events reference student IDs and we need to map them
    name: r.name,
    email: r.email || "",
    youtube_channel: r.youtube_channel || "",
    coach: r.coach || "",
    program: r.program || "accelerator",
    monthly_revenue: r.monthly_revenue || 0,
    signup_date: r.signup_date,
    status: r.status || "active",
    payment_plan: r.payment_plan || "",
    renewal_date: r.renewal_date || "",
    notes: r.notes || "",
    switch_requested_to: r.switch_requested_to || "",
    switch_requested_date: r.switch_requested_date || "",
    member_type: "student",
    classification_source: "manual",
  }));

  const count = await batchInsert("students", mapped);
  console.log(`  Inserted ${count} students into Supabase`);

  // Build a name→new_id map for churn events
  const { data: inserted } = await supabase
    .from("students")
    .select("id, name, email, signup_date");

  const nameMap = new Map<string, string>();
  // Also build old_id → new_id map using name+signup_date as key
  const oldIdMap = new Map<string, string>();
  if (inserted) {
    for (const s of inserted) {
      nameMap.set(s.name, s.id);
    }
    // Map old SQLite IDs to new Supabase IDs via name+signup_date
    for (const oldRow of rows) {
      const key = oldRow.name;
      const newId = nameMap.get(key);
      if (newId) {
        oldIdMap.set(oldRow.id, newId);
      }
    }
  }

  return oldIdMap;
}

async function migrateChurnEvents(studentIdMap: Map<string, string>) {
  console.log("\n--- Churn Events ---");

  const rows = db.prepare("SELECT * FROM churn_events").all() as any[];
  console.log(`  Found ${rows.length} churn events in SQLite`);

  let skipped = 0;
  const mapped = rows
    .map((r) => {
      const newStudentId = studentIdMap.get(r.student_id);
      if (!newStudentId) {
        skipped++;
        return null;
      }
      return {
        student_id: newStudentId,
        event_type: r.event_type,
        event_date: r.event_date,
        reason: r.reason || "",
        monthly_revenue_impact: r.monthly_revenue_impact || 0,
        coach: r.coach || "",
        notes: r.notes || "",
        source: "manual",
      };
    })
    .filter(Boolean);

  if (skipped > 0) {
    console.log(`  Skipped ${skipped} events (student not found)`);
  }

  const count = await batchInsert("churn_events", mapped);
  console.log(`  Inserted ${count} churn events into Supabase`);
}

async function migrateCoachCapacity() {
  console.log("\n--- Coach Capacity ---");

  const rows = db.prepare("SELECT * FROM coach_capacity").all() as any[];
  console.log(`  Found ${rows.length} coaches in SQLite`);

  const mapped = rows.map((r) => ({
    coach_name: r.coach_name,
    max_students: r.max_students,
    preferred_max: r.preferred_max,
    status: r.status || "active",
    notes: r.notes || "",
  }));

  const count = await batchInsert("coach_capacity", mapped);
  console.log(`  Inserted ${count} coaches into Supabase`);
}

async function migrateRepSales() {
  console.log("\n--- Rep Sales ---");

  const rows = db.prepare("SELECT * FROM rep_sales").all() as any[];
  console.log(`  Found ${rows.length} rep sales records in SQLite`);

  const mapped = rows.map((r) => ({
    rep_name: r.rep_name,
    month: r.month,
    product: r.product || "accelerator",
    amount: r.amount || 0,
    new_amount: r.new_amount || 0,
    recurring_amount: r.recurring_amount || 0,
    refund_amount: r.refund_amount || 0,
    deal_count: r.deal_count || 0,
    booked_calls: r.booked_calls || 0,
    notes: r.notes || "",
  }));

  const count = await batchInsert("rep_sales", mapped);
  console.log(`  Inserted ${count} rep sales into Supabase`);
}

async function migrateCalendarEvents() {
  console.log("\n--- Calendar Events ---");

  const rows = db.prepare("SELECT * FROM calendar_events").all() as any[];
  console.log(`  Found ${rows.length} calendar events in SQLite`);

  const mapped = rows.map((r) => ({
    title: r.title,
    description: r.description || "",
    start_date: r.start_date,
    end_date: r.end_date || null,
    event_type: r.event_type || "custom",
    color: r.color || "",
    all_day: r.all_day === 1 || r.all_day === true,
    project_id: r.project_id || null,
  }));

  const count = await batchInsert("calendar_events", mapped);
  console.log(`  Inserted ${count} calendar events into Supabase`);
}

async function main() {
  console.log("=== Mission Control: SQLite → Supabase Migration ===");
  console.log(`Supabase URL: ${supabaseUrl}`);

  try {
    // Check that target tables exist
    const { error: checkError } = await supabase.from("students").select("id").limit(1);
    if (checkError) {
      console.error("Cannot access students table. Did you apply migration 001?", checkError.message);
      process.exit(1);
    }
    const { error: checkError2 } = await supabase.from("rep_sales").select("id").limit(1);
    if (checkError2) {
      console.error("Cannot access rep_sales table. Did you apply migration 002?", checkError2.message);
      process.exit(1);
    }

    // Check if already migrated
    const { count } = await supabase.from("students").select("id", { count: "exact", head: true });
    if (count && count > 0) {
      console.log(`\n⚠ Supabase already has ${count} students. Aborting to prevent duplicates.`);
      console.log("  If you want to re-run, clear the tables first.");
      process.exit(0);
    }

    const studentIdMap = await migrateStudents();
    await migrateChurnEvents(studentIdMap);
    await migrateCoachCapacity();
    await migrateRepSales();
    await migrateCalendarEvents();

    console.log("\n✓ Migration complete!");
  } catch (err) {
    console.error("\n✗ Migration failed:", err);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
