import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "roster") {
      const { data: students, error } = await supabase
        .from("students")
        .select("name, email, program, coach, status, monthly_revenue, payment_plan, signup_date, renewal_date, youtube_channel, switch_requested_to, switch_requested_date, notes")
        .eq("archived", false)
        .order("name", { ascending: true });

      if (error) throw error;

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

      const rows = (students ?? []).map((s) => [
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
      const { data, error } = await supabase
        .from("churn_events")
        .select("event_type, event_date, coach, reason, monthly_revenue_impact, notes, students(name)")
        .order("event_date", { ascending: false });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events = (data ?? []).map((row: any) => {
        const { students: studentData, ...rest } = row;
        return {
          ...rest,
          student_name: (studentData as { name: string } | null)?.name ?? "",
        };
      });

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
      const { data: students, error: studentsError } = await supabase
        .from("students")
        .select("name, email, program, coach, status, monthly_revenue, payment_plan, signup_date, renewal_date, youtube_channel, switch_requested_to, switch_requested_date, notes")
        .eq("archived", false)
        .order("coach", { ascending: true })
        .order("name", { ascending: true });

      if (studentsError) throw studentsError;

      // --- Coach capacity ---
      const { data: coaches, error: coachError } = await supabase
        .from("coach_capacity")
        .select("*")
        .order("coach_name", { ascending: true });

      if (coachError) throw coachError;

      // --- Active counts per coach ---
      const { data: activeData } = await supabase
        .from("students")
        .select("coach")
        .eq("status", "active")
        .eq("archived", false);

      const activeMap = new Map<string, number>();
      for (const row of activeData ?? []) {
        activeMap.set(row.coach, (activeMap.get(row.coach) ?? 0) + 1);
      }

      // --- Aggregate stats ---
      const allStudents = students ?? [];
      const totalStudents = allStudents.length;
      const activeStudents = allStudents.filter((s) => s.status === "active");
      const totalActive = activeStudents.length;
      const totalMRR = activeStudents.reduce((s, r) => s + (r.monthly_revenue || 0), 0);
      const totalCapacity = (coaches ?? [])
        .filter((c) => c.status !== "inactive")
        .reduce((s, c) => s + c.max_students, 0);
      const preferredCapacity = (coaches ?? [])
        .filter((c) => c.status !== "inactive")
        .reduce((s, c) => s + c.preferred_max, 0);
      const utilization = totalCapacity > 0 ? Math.round((totalActive / totalCapacity) * 100) : 0;
      const availableSlots = Math.max(totalCapacity - totalActive, 0);

      // --- Churn stats (last 30 & 90 days) ---
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { count: churn30 } = await supabase
        .from("churn_events")
        .select("*", { count: "exact", head: true })
        .in("event_type", ["cancel", "downgrade", "pause"])
        .gte("event_date", thirtyDaysAgo.toISOString().slice(0, 10));

      const { count: churn90 } = await supabase
        .from("churn_events")
        .select("*", { count: "exact", head: true })
        .in("event_type", ["cancel", "downgrade", "pause"])
        .gte("event_date", ninetyDaysAgo.toISOString().slice(0, 10));

      // --- Program breakdown ---
      const programMap = new Map<string, { cnt: number; mrr: number }>();
      for (const s of activeStudents) {
        const entry = programMap.get(s.program) ?? { cnt: 0, mrr: 0 };
        entry.cnt++;
        entry.mrr += s.monthly_revenue || 0;
        programMap.set(s.program, entry);
      }

      // --- Payment plan breakdown ---
      const planMap = new Map<string, number>();
      for (const s of activeStudents) {
        if (s.payment_plan) {
          planMap.set(s.payment_plan, (planMap.get(s.payment_plan) ?? 0) + 1);
        }
      }

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
      lines.push(`Churn (Last 30 Days),${churn30 ?? 0}`);
      lines.push(`Churn (Last 90 Days),${churn90 ?? 0}`);
      lines.push("");

      // Section 2: Program Breakdown
      lines.push("PROGRAM BREAKDOWN");
      lines.push("Program,Active Students,MRR");
      for (const [program, data] of programMap) {
        lines.push(`${escapeCSV(program)},${data.cnt},$${data.mrr.toFixed(2)}`);
      }
      lines.push("");

      // Section 3: Payment Plan Breakdown
      lines.push("PAYMENT PLAN BREAKDOWN");
      lines.push("Payment Plan,Active Students");
      const sortedPlans = [...planMap.entries()].sort((a, b) => b[1] - a[1]);
      for (const [plan, cnt] of sortedPlans) {
        lines.push(`${escapeCSV(plan || "Not Set")},${cnt}`);
      }
      lines.push("");

      // Section 4: Coach Capacity
      lines.push("COACH CAPACITY");
      lines.push("Coach,Status,Active Students,Preferred Max,Max Students,Available,Utilization %");
      for (const c of coaches ?? []) {
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
      for (const s of allStudents) {
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
