import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/students/capacity
// Returns capacity forecast with 12-month projection.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = createAdminClient();

    // 1. Get coach capacity settings
    const { data: coaches, error: coachError } = await supabase
      .from("coach_capacity")
      .select("*")
      .order("coach_name", { ascending: true });

    if (coachError) throw coachError;

    // 2. Get active student counts per coach
    const { data: activeStudents, error: activeError } = await supabase
      .from("students")
      .select("coach")
      .eq("status", "active");

    if (activeError) throw activeError;

    const activeMap = new Map<string, number>();
    for (const row of activeStudents ?? []) {
      activeMap.set(row.coach, (activeMap.get(row.coach) ?? 0) + 1);
    }

    // 3. Total active students
    const currentActive = activeStudents?.length ?? 0;

    // 4. Build coach detail list
    const coachDetails = (coaches ?? []).map((c) => ({
      ...c,
      active_students: activeMap.get(c.coach_name) ?? 0,
    }));

    // 5. Compute total and preferred capacity (only active + limited coaches)
    const totalCapacity = (coaches ?? [])
      .filter((c) => c.status !== "inactive")
      .reduce((sum, c) => sum + c.max_students, 0);

    const preferredCapacity = (coaches ?? [])
      .filter((c) => c.status !== "inactive")
      .reduce((sum, c) => sum + c.preferred_max, 0);

    // 6. Monthly signups — count students by signup_date month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const { data: allStudents } = await supabase
      .from("students")
      .select("signup_date")
      .not("signup_date", "is", null)
      .neq("signup_date", "");

    const signupMap = new Map<string, number>();
    for (const s of allStudents ?? []) {
      if (s.signup_date) {
        const m = s.signup_date.slice(0, 7);
        signupMap.set(m, (signupMap.get(m) ?? 0) + 1);
      }
    }

    // 7. Monthly net churn
    const { data: allChurnEvents } = await supabase
      .from("churn_events")
      .select("event_date, event_type");

    const churnMap = new Map<string, number>();
    for (const e of allChurnEvents ?? []) {
      const m = e.event_date.slice(0, 7);
      const delta =
        e.event_type === "restart" ? -1 : ["cancel", "downgrade", "pause"].includes(e.event_type) ? 1 : 0;
      churnMap.set(m, (churnMap.get(m) ?? 0) + delta);
    }

    // 8. Compute averages using a common window of completed months
    const windowMonths: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      windowMonths.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      );
    }

    const monthsWithData = windowMonths.filter(
      (m) => signupMap.has(m) || churnMap.has(m)
    );
    const monthsOfData = Math.max(monthsWithData.length, 1);

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

      if (!preferredFullDate && projected >= preferredCapacity && i > 0) {
        preferredFullDate = m;
      }
      if (!capacityFullDate && projected >= totalCapacity && i > 0) {
        capacityFullDate = m;
      }
    }

    // 10. Compute hiring timeline
    const HIRING_PROCESS_DAYS = 42;
    const ONBOARDING_DAYS = 90;

    let postJobDate: string | null = null;
    let hireByDate: string | null = null;
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
