import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/students/data-quality
// Returns enrollment data quality items that need human review:
//   - pending_cancellations: cancel/payment_failed journey events not yet in churn_events
//   - unclassified: students with member_type = 'unclassified'
//   - status_mismatches: active students whose latest charge is cancelled/failed
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = createAdminClient();

    // --- 1. Pending Cancellations ---
    // Journey events of type cancel or payment_failed, joined to contacts → students,
    // excluding students that already have a churn_event for that date.
    const { data: journeyEvents, error: jeError } = await supabase
      .from("journey_events")
      .select("id, contact_id, event_type, event_date, amount, metadata")
      .in("event_type", ["cancel", "payment_failed"])
      .order("event_date", { ascending: false });

    if (jeError) throw jeError;

    const pendingCancellations: Array<{
      student_id: string;
      student_name: string;
      email: string;
      program: string;
      coach: string;
      monthly_revenue: number;
      cancellation_source: string;
      cancellation_date: string;
      journey_event_id: string;
    }> = [];

    if (journeyEvents && journeyEvents.length > 0) {
      // Get all contact IDs from journey events
      const contactIds = [...new Set(journeyEvents.map((je) => je.contact_id))];

      // Find students linked to these contacts
      const { data: students } = await supabase
        .from("students")
        .select("id, contact_id, name, email, program, coach, monthly_revenue, status")
        .in("contact_id", contactIds);

      const studentByContact = new Map<string, any>();
      for (const s of (students || []) as any[]) {
        if (s.contact_id) studentByContact.set(s.contact_id, s);
      }

      // Get existing churn events to exclude already-processed ones
      const studentIds = ((students || []) as any[]).map((s) => s.id);
      let existingChurnDates = new Map<string, Set<string>>();

      if (studentIds.length > 0) {
        const { data: churnEvents } = await supabase
          .from("churn_events")
          .select("student_id, event_date")
          .in("student_id", studentIds);

        for (const ce of churnEvents || []) {
          if (!existingChurnDates.has(ce.student_id)) {
            existingChurnDates.set(ce.student_id, new Set());
          }
          existingChurnDates.get(ce.student_id)!.add(ce.event_date);
        }
      }

      for (const je of journeyEvents) {
        const student = studentByContact.get(je.contact_id);
        if (!student) continue;

        // Skip if already has a churn event for this date
        const eventDate = je.event_date?.slice(0, 10) ?? "";
        const churnDates = existingChurnDates.get(student.id);
        if (churnDates && churnDates.has(eventDate)) continue;

        // Determine source from metadata
        const meta = je.metadata as Record<string, unknown> | null;
        const source = (meta?.source as string) || "samcart_webhook";

        pendingCancellations.push({
          student_id: student.id,
          student_name: student.name,
          email: student.email,
          program: student.program,
          coach: student.coach || "",
          monthly_revenue: student.monthly_revenue || 0,
          cancellation_source: source,
          cancellation_date: eventDate,
          journey_event_id: je.id,
        });
      }
    }

    // --- 2. Unclassified students ---
    const { data: unclassifiedStudents, error: ucError } = await supabase
      .from("students")
      .select("id, name, email, program, member_type")
      .eq("member_type", "unclassified")
      .order("created_at", { ascending: false });

    if (ucError) throw ucError;

    const unclassified = (unclassifiedStudents || []).map((s) => ({
      student_id: s.id,
      student_name: s.name,
      email: s.email,
      program: s.program,
      member_type: s.member_type,
    }));

    // --- 3. Status mismatches ---
    // Active students whose most recent charge has subscription_status = cancelled or failed
    const { data: activeStudents, error: asError } = await supabase
      .from("students")
      .select("id, name, email, contact_id, status")
      .eq("status", "active");

    if (asError) throw asError;

    const statusMismatches: Array<{
      student_id: string;
      student_name: string;
      mc_status: string;
      charge_status: string;
      last_charge_date: string;
    }> = [];

    if (activeStudents && activeStudents.length > 0) {
      const activeContactIds = activeStudents
        .filter((s) => s.contact_id)
        .map((s) => s.contact_id!);

      if (activeContactIds.length > 0) {
        // Get latest charge per contact
        const { data: charges } = await supabase
          .from("charges")
          .select("contact_id, subscription_status, charge_date")
          .in("contact_id", activeContactIds)
          .order("charge_date", { ascending: false });

        // Group by contact, take latest
        const latestChargeByContact = new Map<
          string,
          { subscription_status: string; charge_date: string }
        >();
        for (const c of charges || []) {
          if (c.contact_id && !latestChargeByContact.has(c.contact_id)) {
            latestChargeByContact.set(c.contact_id, {
              subscription_status: c.subscription_status || "",
              charge_date: c.charge_date || "",
            });
          }
        }

        for (const student of activeStudents) {
          if (!student.contact_id) continue;
          const latest = latestChargeByContact.get(student.contact_id);
          if (!latest) continue;
          if (
            latest.subscription_status === "cancelled" ||
            latest.subscription_status === "failed"
          ) {
            statusMismatches.push({
              student_id: student.id,
              student_name: student.name,
              mc_status: student.status,
              charge_status: latest.subscription_status,
              last_charge_date: latest.charge_date,
            });
          }
        }
      }
    }

    return NextResponse.json({
      pending_cancellations: pendingCancellations,
      unclassified,
      status_mismatches: statusMismatches,
    });
  } catch (error) {
    console.error("[GET /api/students/data-quality]", error);
    return NextResponse.json(
      { error: "Failed to fetch data quality items" },
      { status: 500 }
    );
  }
}
