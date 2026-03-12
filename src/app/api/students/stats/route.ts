import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/students/stats
// Compute student tracking statistics for a given month.
// Optional: ?month=YYYY-MM (defaults to current month)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month =
      searchParams.get("month") || new Date().toISOString().slice(0, 7);

    // Total active students by program
    const eliteCount = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM students WHERE program = 'elite' AND status = 'active'"
      )
      .get() as { cnt: number };

    const acceleratorCount = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM students WHERE program = 'accelerator' AND status = 'active'"
      )
      .get() as { cnt: number };

    // Monthly churn: count and revenue impact
    const churnStats = db
      .prepare(
        `SELECT COUNT(*) AS churn_count, COALESCE(SUM(monthly_revenue_impact), 0) AS churn_revenue
         FROM churn_events
         WHERE event_date LIKE ? AND event_type != 'restart'`
      )
      .get(`${month}%`) as { churn_count: number; churn_revenue: number };

    // New students this month: students whose signup_date falls in the month
    const newStudentStats = db
      .prepare(
        `SELECT COUNT(*) AS new_count, COALESCE(SUM(monthly_revenue), 0) AS new_revenue
         FROM students
         WHERE signup_date LIKE ?`
      )
      .get(`${month}%`) as { new_count: number; new_revenue: number };

    // Churn rate: monthly_churn_count / (total_active + monthly_churn_count) * 100
    const totalActive = eliteCount.cnt + acceleratorCount.cnt;
    const churnDenominator = totalActive + churnStats.churn_count;
    const churnRate =
      churnDenominator > 0
        ? Math.round(
            (churnStats.churn_count / churnDenominator) * 100 * 100
          ) / 100
        : 0;

    // Average attendance rate across sessions this month
    // For each session in the month, compute attended / total_elite_students
    const sessionsThisMonth = db
      .prepare(
        `SELECT es.id,
                COALESCE(att.attended_count, 0) AS attended_count
         FROM elite_sessions es
         LEFT JOIN (
           SELECT session_id, COUNT(*) AS attended_count
           FROM elite_attendance
           WHERE attended = 1
           GROUP BY session_id
         ) att ON att.session_id = es.id
         WHERE es.session_date LIKE ?`
      )
      .all(`${month}%`) as { id: string; attended_count: number }[];

    let avgAttendanceRate = 0;
    if (sessionsThisMonth.length > 0 && eliteCount.cnt > 0) {
      const totalRate = sessionsThisMonth.reduce((sum, s) => {
        return sum + (s.attended_count / eliteCount.cnt) * 100;
      }, 0);
      avgAttendanceRate =
        Math.round((totalRate / sessionsThisMonth.length) * 100) / 100;
    }

    return NextResponse.json({
      total_active_elite: eliteCount.cnt,
      total_active_accelerator: acceleratorCount.cnt,
      monthly_churn_count: churnStats.churn_count,
      monthly_churn_revenue: churnStats.churn_revenue,
      monthly_new_students: newStudentStats.new_count,
      monthly_new_revenue: newStudentStats.new_revenue,
      churn_rate: churnRate,
      avg_attendance_rate: avgAttendanceRate,
    });
  } catch (error) {
    console.error("[GET /api/students/stats]", error);
    return NextResponse.json(
      { error: "Failed to compute student stats" },
      { status: 500 }
    );
  }
}
