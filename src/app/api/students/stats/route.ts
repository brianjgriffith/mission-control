import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/students/stats
// Compute student tracking statistics for a given month.
// Optional: ?month=YYYY-MM (defaults to current month)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const month =
      searchParams.get("month") || new Date().toISOString().slice(0, 7);

    // Compute month range for date filters
    const [mY, mM] = month.split("-").map(Number);
    const monthStart = `${month}-01`;
    const monthEnd = mM === 12 ? `${mY + 1}-01-01` : `${mY}-${String(mM + 1).padStart(2, "0")}-01`;

    // Total active students by program (exclude archived and partners)
    const { count: eliteCount } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("program", "elite")
      .eq("status", "active")
      .eq("archived", false)
      .or("member_type.is.null,member_type.neq.partner");

    const { count: acceleratorCount } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("program", "accelerator")
      .eq("status", "active")
      .eq("archived", false)
      .or("member_type.is.null,member_type.neq.partner");

    const eliteCnt = eliteCount ?? 0;
    const acceleratorCnt = acceleratorCount ?? 0;

    // Monthly churn: count unique students and revenue impact
    const { data: churnData } = await supabase
      .from("churn_events")
      .select("student_id, monthly_revenue_impact")
      .gte("event_date", monthStart)
      .lt("event_date", monthEnd)
      .neq("event_type", "restart");

    // Check for restarts this month to exclude students who churned then restarted
    const { data: restartData } = await supabase
      .from("churn_events")
      .select("student_id")
      .gte("event_date", monthStart)
      .lt("event_date", monthEnd)
      .eq("event_type", "restart");

    const restartedStudents = new Set((restartData ?? []).map((e) => e.student_id));

    // Deduplicate by student_id and exclude students who also restarted this month
    const uniqueChurnStudents = new Set(
      (churnData ?? [])
        .map((e) => e.student_id)
        .filter((id) => !restartedStudents.has(id))
    );
    const churnCount = uniqueChurnStudents.size;
    const churnRevenue = (churnData ?? [])
      .filter((e) => !restartedStudents.has(e.student_id))
      .reduce((sum, e) => sum + (e.monthly_revenue_impact || 0), 0);

    // New students this month (exclude archived and partners)
    const { data: newStudents } = await supabase
      .from("students")
      .select("monthly_revenue")
      .gte("signup_date", monthStart)
      .lt("signup_date", monthEnd)
      .eq("archived", false)
      .or("member_type.is.null,member_type.neq.partner");

    const newCount = newStudents?.length ?? 0;
    const newRevenue = newStudents?.reduce(
      (sum, s) => sum + (s.monthly_revenue || 0),
      0
    ) ?? 0;

    // Churn rate
    const totalActive = eliteCnt + acceleratorCnt;
    const churnDenominator = totalActive + churnCount;
    const churnRate =
      churnDenominator > 0
        ? Math.round((churnCount / churnDenominator) * 100 * 100) / 100
        : 0;

    // Average attendance rate across sessions this month
    const { data: sessionsThisMonth } = await supabase
      .from("elite_sessions")
      .select("id")
      .gte("session_date", monthStart)
      .lt("session_date", monthEnd);

    let avgAttendanceRate = 0;
    if (sessionsThisMonth && sessionsThisMonth.length > 0 && eliteCnt > 0) {
      let totalRate = 0;
      for (const session of sessionsThisMonth) {
        const { count: attendedCount } = await supabase
          .from("elite_attendance")
          .select("*", { count: "exact", head: true })
          .eq("session_id", session.id)
          .eq("attended", true);

        totalRate += ((attendedCount ?? 0) / eliteCnt) * 100;
      }
      avgAttendanceRate =
        Math.round((totalRate / sessionsThisMonth.length) * 100) / 100;
    }

    return NextResponse.json({
      total_active_elite: eliteCnt,
      total_active_accelerator: acceleratorCnt,
      monthly_churn_count: churnCount,
      monthly_churn_revenue: churnRevenue,
      monthly_new_students: newCount,
      monthly_new_revenue: newRevenue,
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
