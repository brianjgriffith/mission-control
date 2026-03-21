import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/students/mrr-history
// Reconstructs monthly MRR from student signup + churn event data.
// ---------------------------------------------------------------------------

interface StudentRecord {
  id: string;
  signup_date: string;
  status: string;
  program: string;
  monthly_revenue: number;
}

interface ChurnRecord {
  id: string;
  student_id: string;
  event_type: string;
  event_date: string;
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("id, signup_date, status, program, monthly_revenue")
      .order("signup_date", { ascending: true });

    if (studentsError) throw studentsError;

    const { data: churnEvents, error: churnError } = await supabase
      .from("churn_events")
      .select("id, student_id, event_type, event_date")
      .order("event_date", { ascending: true });

    if (churnError) throw churnError;

    const typedStudents = (students ?? []) as StudentRecord[];
    const typedChurnEvents = (churnEvents ?? []) as ChurnRecord[];

    if (typedStudents.length === 0) {
      return NextResponse.json({
        months: [],
        concentration: {
          top_5_pct: 0,
          top_10_pct: 0,
          avg_revenue: 0,
          median_revenue: 0,
          revenue_tiers: [],
        },
      });
    }

    // -----------------------------------------------------------------------
    // Build month list from earliest signup to current month
    // -----------------------------------------------------------------------
    const earliestSignup = typedStudents.reduce(
      (min, s) => (s.signup_date && s.signup_date < min ? s.signup_date : min),
      typedStudents[0].signup_date || new Date().toISOString().slice(0, 10)
    );

    const startMonth = earliestSignup.slice(0, 7);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const allMonths: string[] = [];
    {
      let [y, m] = startMonth.split("-").map(Number);
      const [endY, endM] = currentMonth.split("-").map(Number);
      while (y < endY || (y === endY && m <= endM)) {
        allMonths.push(`${y}-${String(m).padStart(2, "0")}`);
        m++;
        if (m > 12) {
          m = 1;
          y++;
        }
      }
    }

    // -----------------------------------------------------------------------
    // For each month, determine which students were "active"
    // -----------------------------------------------------------------------
    const studentChurnMap = new Map<string, ChurnRecord[]>();
    for (const e of typedChurnEvents) {
      if (!studentChurnMap.has(e.student_id)) {
        studentChurnMap.set(e.student_id, []);
      }
      studentChurnMap.get(e.student_id)!.push(e);
    }

    // Students imported as non-active with no churn events at all
    const importedInactive = new Set(
      typedStudents
        .filter(
          (s) =>
            s.status !== "active" &&
            !studentChurnMap.has(s.id)
        )
        .map((s) => s.id)
    );

    const months = allMonths.map((month) => {
      const monthEnd = lastDayOfMonth(month);

      const churnedSet = new Set<string>();
      for (const s of typedStudents) {
        if (s.signup_date > monthEnd) continue;
        if (importedInactive.has(s.id)) {
          churnedSet.add(s.id);
          continue;
        }
        const events = studentChurnMap.get(s.id) ?? [];
        let isChurned = false;
        for (const e of events) {
          if (e.event_date > monthEnd) break;
          if (e.event_type === "restart") {
            isChurned = false;
          } else {
            isChurned = true;
          }
        }
        if (isChurned) churnedSet.add(s.id);
      }

      const activeStudents = typedStudents.filter(
        (s) =>
          s.signup_date &&
          s.signup_date <= monthEnd &&
          !churnedSet.has(s.id)
      );

      let total_mrr = 0;
      let elite_mrr = 0;
      let accelerator_mrr = 0;
      let elite_count = 0;
      let accelerator_count = 0;

      for (const s of activeStudents) {
        const rev = s.monthly_revenue || 0;
        total_mrr += rev;
        if (s.program === "elite") {
          elite_mrr += rev;
          elite_count++;
        } else {
          accelerator_mrr += rev;
          accelerator_count++;
        }
      }

      return {
        month,
        total_mrr,
        elite_mrr,
        accelerator_mrr,
        student_count: activeStudents.length,
        elite_count,
        accelerator_count,
      };
    });

    // -----------------------------------------------------------------------
    // Revenue concentration (based on current active students)
    // -----------------------------------------------------------------------
    const activeStudents = typedStudents.filter(
      (s) => s.status === "active"
    );
    const revenues = activeStudents
      .map((s) => s.monthly_revenue || 0)
      .sort((a, b) => b - a);

    const totalRevenue = revenues.reduce((s, r) => s + r, 0);
    const avg_revenue = revenues.length > 0 ? Math.round(totalRevenue / revenues.length) : 0;

    let median_revenue = 0;
    if (revenues.length > 0) {
      const mid = Math.floor(revenues.length / 2);
      median_revenue =
        revenues.length % 2 === 0
          ? Math.round((revenues[mid - 1] + revenues[mid]) / 2)
          : revenues[mid];
    }

    const top5Rev = revenues.slice(0, 5).reduce((s, r) => s + r, 0);
    const top10Rev = revenues.slice(0, 10).reduce((s, r) => s + r, 0);
    const top_5_pct = totalRevenue > 0 ? Math.round((top5Rev / totalRevenue) * 1000) / 10 : 0;
    const top_10_pct = totalRevenue > 0 ? Math.round((top10Rev / totalRevenue) * 1000) / 10 : 0;

    const tierRanges = [
      { range: "$0-500", min: 0, max: 500 },
      { range: "$500-1000", min: 500, max: 1000 },
      { range: "$1000-1500", min: 1000, max: 1500 },
      { range: "$1500-2000", min: 1500, max: 2000 },
      { range: "$2000+", min: 2000, max: Infinity },
    ];

    const revenue_tiers = tierRanges.map(({ range, min, max }) => {
      const matching = activeStudents.filter((s) => {
        const rev = s.monthly_revenue || 0;
        return rev >= min && rev < max;
      });
      return {
        range,
        count: matching.length,
        mrr: matching.reduce((s, st) => s + (st.monthly_revenue || 0), 0),
      };
    });

    return NextResponse.json({
      months,
      concentration: {
        top_5_pct,
        top_10_pct,
        avg_revenue,
        median_revenue,
        revenue_tiers,
      },
    });
  } catch (error) {
    console.error("[GET /api/students/mrr-history]", error);
    return NextResponse.json(
      { error: "Failed to compute MRR history" },
      { status: 500 }
    );
  }
}

/** Get the last day of a YYYY-MM month as YYYY-MM-DD string */
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}
