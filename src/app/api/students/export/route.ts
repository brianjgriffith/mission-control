import { NextRequest, NextResponse } from "next/server";
import { getDb, type StudentRow, type ChurnEventRow, type CoachCapacityRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/students/export?type=roster|churn|full
// Export student data as CSV.
// ---------------------------------------------------------------------------

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCSV).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCSV).join(","));
  }
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "roster") {
      const students = db
        .prepare(
          `SELECT name, email, program, coach, status, monthly_revenue, payment_plan, signup_date, renewal_date, youtube_channel, switch_requested_to, switch_requested_date, notes
           FROM students
           ORDER BY name ASC`
        )
        .all() as Pick<
        StudentRow,
        "name" | "email" | "program" | "coach" | "status" | "monthly_revenue" | "payment_plan" | "signup_date" | "renewal_date" | "youtube_channel" | "switch_requested_to" | "switch_requested_date" | "notes"
      >[];

      const headers = [
        "Name",
        "Email",
        "Program",
        "Coach",
        "Status",
        "Monthly Revenue",
        "Payment Plan",
        "Signup Date",
        "Renewal Date",
        "YouTube Channel",
        "Switch Requested To",
        "Switch Requested Date",
        "Notes",
      ];

      const rows = students.map((s) => [
        s.name,
        s.email,
        s.program,
        s.coach,
        s.status,
        s.monthly_revenue,
        s.payment_plan,
        s.signup_date,
        s.renewal_date,
        s.youtube_channel,
        s.switch_requested_to,
        s.switch_requested_date,
        s.notes,
      ]);

      const csv = toCSV(headers, rows);
      const date = new Date().toISOString().slice(0, 10);

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="students-roster-${date}.csv"`,
        },
      });
    }

    if (type === "churn") {
      const events = db
        .prepare(
          `SELECT c.event_type, c.event_date, c.coach, c.reason, c.monthly_revenue_impact, c.notes,
                  s.name AS student_name
           FROM churn_events c
           LEFT JOIN students s ON s.id = c.student_id
           ORDER BY c.event_date DESC`
        )
        .all() as (Pick<
        ChurnEventRow,
        "event_type" | "event_date" | "coach" | "reason" | "monthly_revenue_impact" | "notes"
      > & { student_name: string })[];

      const headers = [
        "Student Name",
        "Event Type",
        "Event Date",
        "Coach",
        "Reason",
        "Revenue Impact",
        "Notes",
      ];

      const rows = events.map((e) => [
        e.student_name,
        e.event_type,
        e.event_date,
        e.coach,
        e.reason,
        e.monthly_revenue_impact,
        e.notes,
      ]);

      const csv = toCSV(headers, rows);
      const date = new Date().toISOString().slice(0, 10);

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="churn-events-${date}.csv"`,
        },
      });
    }

    // -----------------------------------------------------------------------
    // Full report: summary stats, coach capacity, and full roster in one CSV
    // -----------------------------------------------------------------------
    if (type === "full") {
      const date = new Date().toISOString().slice(0, 10);

      // --- Students ---
      const students = db
        .prepare(
          `SELECT name, email, program, coach, status, monthly_revenue, payment_plan, signup_date, renewal_date, youtube_channel, switch_requested_to, switch_requested_date, notes
           FROM students
           ORDER BY coach ASC, name ASC`
        )
        .all() as Pick<
        StudentRow,
        "name" | "email" | "program" | "coach" | "status" | "monthly_revenue" | "payment_plan" | "signup_date" | "renewal_date" | "youtube_channel" | "switch_requested_to" | "switch_requested_date" | "notes"
      >[];

      // --- Coach capacity ---
      const coaches = db
        .prepare("SELECT * FROM coach_capacity ORDER BY coach_name ASC")
        .all() as CoachCapacityRow[];

      // --- Active counts per coach ---
      const activeCounts = db
        .prepare(
          `SELECT coach, COUNT(*) AS cnt FROM students WHERE status = 'active' GROUP BY coach`
        )
        .all() as { coach: string; cnt: number }[];
      const activeMap = new Map(activeCounts.map((r) => [r.coach, r.cnt]));

      // --- Aggregate stats ---
      const totalActive = activeCounts.reduce((s, r) => s + r.cnt, 0);
      const totalStudents = students.length;
      const activeStudents = students.filter((s) => s.status === "active");
      const totalMRR = activeStudents.reduce((s, r) => s + (r.monthly_revenue || 0), 0);
      const totalCapacity = coaches
        .filter((c) => c.status !== "inactive")
        .reduce((s, c) => s + c.max_students, 0);
      const preferredCapacity = coaches
        .filter((c) => c.status !== "inactive")
        .reduce((s, c) => s + c.preferred_max, 0);
      const utilization = totalCapacity > 0 ? Math.round((totalActive / totalCapacity) * 100) : 0;
      const availableSlots = Math.max(totalCapacity - totalActive, 0);

      // --- Churn stats (last 30 & 90 days) ---
      const churn30 = (db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM churn_events WHERE event_type IN ('cancel','downgrade','pause') AND event_date >= date('now','-30 days')`
        )
        .get() as { cnt: number }).cnt;
      const churn90 = (db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM churn_events WHERE event_type IN ('cancel','downgrade','pause') AND event_date >= date('now','-90 days')`
        )
        .get() as { cnt: number }).cnt;

      // --- Program breakdown ---
      const programCounts = db
        .prepare(
          `SELECT program, COUNT(*) AS cnt FROM students WHERE status = 'active' GROUP BY program`
        )
        .all() as { program: string; cnt: number }[];

      // --- Payment plan breakdown ---
      const planCounts = db
        .prepare(
          `SELECT payment_plan, COUNT(*) AS cnt FROM students WHERE status = 'active' AND payment_plan != '' GROUP BY payment_plan ORDER BY cnt DESC`
        )
        .all() as { payment_plan: string; cnt: number }[];

      // Build the CSV with sections separated by blank lines
      const lines: string[] = [];

      // Section 1: Summary
      lines.push("SUMMARY");
      lines.push(`Report Date,${date}`);
      lines.push(`Total Students,${totalStudents}`);
      lines.push(`Active Students,${totalActive}`);
      lines.push(`Monthly Recurring Revenue,$${totalMRR.toFixed(2)}`);
      lines.push(`Total Capacity,${totalCapacity}`);
      lines.push(`Preferred Capacity,${preferredCapacity}`);
      lines.push(`Available Slots,${availableSlots}`);
      lines.push(`Utilization,${utilization}%`);
      lines.push(`Churn (Last 30 Days),${churn30}`);
      lines.push(`Churn (Last 90 Days),${churn90}`);
      lines.push("");

      // Section 2: Program Breakdown
      lines.push("PROGRAM BREAKDOWN");
      lines.push("Program,Active Students,MRR");
      for (const p of programCounts) {
        const mrr = activeStudents
          .filter((s) => s.program === p.program)
          .reduce((s, r) => s + (r.monthly_revenue || 0), 0);
        lines.push(`${escapeCSV(p.program)},${p.cnt},$${mrr.toFixed(2)}`);
      }
      lines.push("");

      // Section 3: Payment Plan Breakdown
      lines.push("PAYMENT PLAN BREAKDOWN");
      lines.push("Payment Plan,Active Students");
      for (const p of planCounts) {
        lines.push(`${escapeCSV(p.payment_plan || "Not Set")},${p.cnt}`);
      }
      lines.push("");

      // Section 4: Coach Capacity
      lines.push("COACH CAPACITY");
      lines.push("Coach,Status,Active Students,Preferred Max,Max Students,Available,Utilization %");
      for (const c of coaches) {
        const active = activeMap.get(c.coach_name) ?? 0;
        const avail = Math.max(c.max_students - active, 0);
        const util = c.max_students > 0 ? Math.round((active / c.max_students) * 100) : 0;
        lines.push(
          [
            escapeCSV(c.coach_name),
            c.status,
            active,
            c.preferred_max,
            c.max_students,
            avail,
            `${util}%`,
          ].join(",")
        );
      }
      lines.push("");

      // Section 5: Full Roster
      lines.push("FULL ROSTER");
      const rosterHeaders = [
        "Name", "Email", "Program", "Coach", "Status", "Monthly Revenue",
        "Payment Plan", "Signup Date", "Renewal Date", "YouTube Channel",
        "Switch Requested To", "Switch Requested Date", "Notes",
      ];
      lines.push(rosterHeaders.map(escapeCSV).join(","));
      for (const s of students) {
        lines.push(
          [
            s.name, s.email, s.program, s.coach, s.status, s.monthly_revenue,
            s.payment_plan, s.signup_date, s.renewal_date, s.youtube_channel,
            s.switch_requested_to, s.switch_requested_date, s.notes,
          ]
            .map(escapeCSV)
            .join(",")
        );
      }

      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="mission-control-full-report-${date}.csv"`,
        },
      });
    }

    return NextResponse.json(
      { error: "type query parameter must be 'roster', 'churn', or 'full'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[GET /api/students/export]", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    );
  }
}
