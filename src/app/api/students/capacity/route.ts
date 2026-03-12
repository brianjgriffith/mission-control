import { NextResponse } from "next/server";
import { getDb, type CoachCapacityRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/students/capacity
// Returns capacity forecast with 12-month projection.
// ---------------------------------------------------------------------------

interface ActiveCountRow {
  coach: string;
  active_count: number;
}

interface MonthlySignupRow {
  month: string;
  count: number;
}

interface MonthlyChurnRow {
  month: string;
  count: number;
}

export async function GET() {
  try {
    const db = getDb();

    // 1. Get coach capacity settings
    const coaches = db
      .prepare("SELECT * FROM coach_capacity ORDER BY coach_name ASC")
      .all() as CoachCapacityRow[];

    // 2. Get active student counts per coach
    const activeCounts = db
      .prepare(
        `SELECT coach, COUNT(*) AS active_count
         FROM students
         WHERE status = 'active'
         GROUP BY coach`
      )
      .all() as ActiveCountRow[];

    const activeMap = new Map<string, number>();
    for (const row of activeCounts) {
      activeMap.set(row.coach, row.active_count);
    }

    // 3. Total active students
    const totalActiveRow = db
      .prepare("SELECT COUNT(*) AS cnt FROM students WHERE status = 'active'")
      .get() as { cnt: number };
    const currentActive = totalActiveRow.cnt;

    // 4. Build coach detail list
    const coachDetails = coaches.map((c) => ({
      ...c,
      active_students: activeMap.get(c.coach_name) ?? 0,
    }));

    // 5. Compute total and preferred capacity (only active + limited coaches)
    const totalCapacity = coaches
      .filter((c) => c.status !== "inactive")
      .reduce((sum, c) => sum + c.max_students, 0);

    const preferredCapacity = coaches
      .filter((c) => c.status !== "inactive")
      .reduce((sum, c) => sum + c.preferred_max, 0);

    // 6. Monthly signups — count students by signup_date month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const monthlySignups = db
      .prepare(
        `SELECT substr(signup_date, 1, 7) AS month, COUNT(*) AS count
         FROM students
         WHERE signup_date IS NOT NULL AND signup_date != ''
         GROUP BY substr(signup_date, 1, 7)
         ORDER BY month ASC`
      )
      .all() as MonthlySignupRow[];

    // 7. Monthly net churn — cancels/downgrades/pauses minus restarts
    const monthlyChurn = db
      .prepare(
        `SELECT substr(event_date, 1, 7) AS month,
                SUM(CASE WHEN event_type IN ('cancel', 'downgrade', 'pause') THEN 1
                         WHEN event_type = 'restart' THEN -1
                         ELSE 0 END) AS count
         FROM churn_events
         GROUP BY substr(event_date, 1, 7)
         ORDER BY month ASC`
      )
      .all() as MonthlyChurnRow[];

    // 8. Compute averages using a common window of completed months
    //    Both signups and churn use the SAME N-month window so months
    //    with 0 churn still count as 0 (not excluded from the average).

    // Build the list of last 6 completed months (e.g., Aug–Jan if current is Feb)
    const windowMonths: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      windowMonths.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      );
    }

    // Only use months where we have ANY data (signups or churn) to avoid
    // averaging in months before the business was tracking
    const signupMap = new Map(monthlySignups.map((r) => [r.month, r.count]));
    const churnMap = new Map(monthlyChurn.map((r) => [r.month, r.count]));

    const monthsWithData = windowMonths.filter(
      (m) => signupMap.has(m) || churnMap.has(m)
    );
    const monthsOfData = Math.max(monthsWithData.length, 1);

    // Sum signups and churn across the common window (0 if no data for a month)
    let totalSignups = 0;
    let totalChurnCount = 0;
    for (const m of monthsWithData) {
      totalSignups += signupMap.get(m) ?? 0;
      totalChurnCount += churnMap.get(m) ?? 0;
    }

    const avgSignups = totalSignups / monthsOfData;
    const avgChurn = totalChurnCount / monthsOfData;
    const netGrowth = avgSignups - avgChurn;

    // 9. Project 12 months forward
    const MONTHS = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    const projections: {
      month: string;
      label: string;
      projected_students: number;
      total_capacity: number;
      preferred_capacity: number;
    }[] = [];

    let capacityFullDate: string | null = null;
    let preferredFullDate: string | null = null;

    for (let i = 0; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

      // Month 0 = current actual count; subsequent months use net growth
      const rawProjected =
        i === 0
          ? currentActive
          : Math.round(currentActive + netGrowth * i);
      const projected = Math.max(rawProjected, 0);

      projections.push({
        month: m,
        label,
        projected_students: projected,
        total_capacity: totalCapacity,
        preferred_capacity: preferredCapacity,
      });

      // Track when thresholds are first exceeded
      if (!preferredFullDate && projected >= preferredCapacity && i > 0) {
        preferredFullDate = m;
      }
      if (!capacityFullDate && projected >= totalCapacity && i > 0) {
        capacityFullDate = m;
      }
    }

    // 10. Compute hiring timeline
    //     - 42 days (~6 weeks) for hiring process: post listing, interviews, offer, notice period
    //     - 90 days for onboarding: new coach ramps up to take students
    //     Timeline: post_job_date → hire_date (6 wks) → coach_ready (90 days) ≤ capacity_full
    const HIRING_PROCESS_DAYS = 42; // ~6 weeks
    const ONBOARDING_DAYS = 90;

    let postJobDate: string | null = null;  // when to start recruiting
    let hireByDate: string | null = null;   // when new coach must start (begin onboarding)
    if (capacityFullDate) {
      const [y, mo] = capacityFullDate.split("-").map(Number);
      const fullDate = new Date(y, mo - 1, 1);

      const hireDateObj = new Date(fullDate);
      hireDateObj.setDate(hireDateObj.getDate() - ONBOARDING_DAYS);
      hireByDate = `${hireDateObj.getFullYear()}-${String(hireDateObj.getMonth() + 1).padStart(2, "0")}-${String(hireDateObj.getDate()).padStart(2, "0")}`;

      const postDateObj = new Date(hireDateObj);
      postDateObj.setDate(postDateObj.getDate() - HIRING_PROCESS_DAYS);
      postJobDate = `${postDateObj.getFullYear()}-${String(postDateObj.getMonth() + 1).padStart(2, "0")}-${String(postDateObj.getDate()).padStart(2, "0")}`;
    }

    // 11. Utilization
    const availableSlots = Math.max(totalCapacity - currentActive, 0);
    const utilizationPct =
      totalCapacity > 0 ? Math.round((currentActive / totalCapacity) * 100) : 0;

    return NextResponse.json({
      coaches: coachDetails,
      projections,
      current_active: currentActive,
      total_capacity: totalCapacity,
      preferred_capacity: preferredCapacity,
      available_slots: availableSlots,
      utilization_pct: utilizationPct,
      avg_monthly_signups: Math.round(avgSignups * 10) / 10,
      avg_monthly_churn: Math.round(avgChurn * 10) / 10,
      net_monthly_growth: Math.round(netGrowth * 10) / 10,
      months_of_data: monthsOfData,
      capacity_full_date: capacityFullDate,
      preferred_full_date: preferredFullDate,
      post_job_date: postJobDate,
      hire_by_date: hireByDate,
    });
  } catch (error) {
    console.error("[GET /api/students/capacity]", error);
    return NextResponse.json(
      { error: "Failed to compute capacity forecast" },
      { status: 500 }
    );
  }
}
