import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeYouTubeChannel } from "@/lib/youtube";

// ---------------------------------------------------------------------------
// POST /api/students/sync
//
// Called by n8n when a new contact is added to the "ACTIVE: VRA Accelerator"
// HubSpot list. Handles:
//   1. Find or create the contact in Mission Control
//   2. Normalize YouTube channel URL
//   3. Classify as student or partner
//   4. Create/update the student record
//   5. Log a journey event
//   6. Return the student data for downstream use (e.g., Accelerator Hub)
//
// Auth: Uses a shared webhook secret (n8n → MC).
// ---------------------------------------------------------------------------

interface SyncStudentBody {
  // Contact info (from HubSpot)
  email: string;
  first_name: string;
  last_name: string;
  hubspot_contact_id: string;
  phone?: string;
  youtube_channel_raw?: string; // Raw "Link to YouTube Channel" property

  // Enrollment info
  program?: "accelerator" | "elite";
  signup_date?: string; // YYYY-MM-DD
  monthly_revenue?: number;
  payment_plan?: string;

  // Partner detection
  is_partner?: boolean;
  linked_student_email?: string; // Email of the student this partner is linked to
  partner_email?: string; // If this STUDENT has a partner, this is the partner's email

  // Optional charge info
  charge_amount?: number;
  charge_date?: string;
}

export async function POST(request: NextRequest) {
  try {
    // --- Auth check ---
    const secret = request.headers.get("x-webhook-secret");
    if (!secret || secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as SyncStudentBody;
    const supabase = createAdminClient();

    // --- Validate required fields ---
    if (!body.email?.trim()) {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      );
    }
    if (!body.hubspot_contact_id?.trim()) {
      return NextResponse.json(
        { error: "hubspot_contact_id is required" },
        { status: 400 }
      );
    }

    const email = body.email.trim().toLowerCase();
    const fullName =
      `${body.first_name ?? ""} ${body.last_name ?? ""}`.trim() || email;
    const program = body.program ?? "accelerator";
    const signupDate =
      body.signup_date ?? new Date().toISOString().split("T")[0];

    // --- 1. Find or create contact ---
    let contactId: string | null = null;

    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("hubspot_contact_id", body.hubspot_contact_id)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const { data: newContact, error: contactErr } = await supabase
        .from("contacts")
        .insert({
          hubspot_contact_id: body.hubspot_contact_id,
          email,
          first_name: body.first_name ?? "",
          last_name: body.last_name ?? "",
          phone: body.phone ?? "",
          lifecycle_stage: "customer",
          metadata: {},
        })
        .select("id")
        .single();

      if (contactErr) throw contactErr;
      contactId = newContact.id;
    }

    // --- 2. Normalize YouTube ---
    const youtubeChannel = normalizeYouTubeChannel(body.youtube_channel_raw);

    // --- 3. Determine member type ---
    let memberType: "student" | "partner" | "unclassified" = "student";
    let linkedStudentId: string | null = null;

    if (body.is_partner && body.linked_student_email) {
      memberType = "partner";

      // Look up the linked student by email
      const { data: linkedStudent } = await supabase
        .from("students")
        .select("id")
        .eq("email", body.linked_student_email.trim().toLowerCase())
        .eq("program", program)
        .eq("status", "active")
        .maybeSingle();

      if (linkedStudent) {
        linkedStudentId = linkedStudent.id;
      }
    }

    // --- 4. Upsert student ---
    // Check if student already exists by email + program
    const { data: existingStudent } = await supabase
      .from("students")
      .select("id, status")
      .eq("email", email)
      .eq("program", program)
      .maybeSingle();

    let student;

    if (existingStudent) {
      // Update existing — don't overwrite fields that may have been manually set
      const updates: Record<string, unknown> = {
        contact_id: contactId,
        status: "active",
        member_type: memberType,
        updated_at: new Date().toISOString(),
      };

      if (youtubeChannel) updates.youtube_channel = youtubeChannel;
      if (linkedStudentId) updates.linked_student_id = linkedStudentId;
      if (body.monthly_revenue != null)
        updates.monthly_revenue = body.monthly_revenue;
      if (body.payment_plan) updates.payment_plan = body.payment_plan;

      const { data, error } = await supabase
        .from("students")
        .update(updates)
        .eq("id", existingStudent.id)
        .select()
        .single();

      if (error) throw error;
      student = data;
    } else {
      // Create new student
      const { data, error } = await supabase
        .from("students")
        .insert({
          contact_id: contactId,
          name: fullName,
          email,
          youtube_channel: youtubeChannel ?? "",
          coach: "",
          program,
          monthly_revenue: body.monthly_revenue ?? 0,
          signup_date: signupDate,
          status: "active",
          payment_plan: body.payment_plan ?? "",
          renewal_date: "",
          notes: "",
          member_type: memberType,
          linked_student_id: linkedStudentId,
          hubspot_segment: "ACTIVE: VRA Accelerator",
          classification_source: "n8n_sync",
        })
        .select()
        .single();

      if (error) throw error;
      student = data;
    }

    // --- 5. Log journey event ---
    await supabase.from("journey_events").insert({
      contact_id: contactId,
      event_type: "purchase",
      event_date: signupDate,
      amount: body.charge_amount ?? null,
      metadata: {
        program,
        member_type: memberType,
        source: "n8n_accelerator_sync",
        youtube_channel: youtubeChannel,
      },
    });

    // --- 6. Auto-create partner if partner_email is provided ---
    let partnerCreated = false;
    if (body.partner_email && body.partner_email.trim() && student) {
      const partnerEmail = body.partner_email.trim().toLowerCase();

      // Check if partner already exists
      const { data: existingPartnerRecord } = await supabase
        .from("students")
        .select("id, member_type, linked_student_id")
        .eq("email", partnerEmail)
        .eq("program", program)
        .maybeSingle();

      if (existingPartnerRecord) {
        // Update to partner if not already
        if (
          existingPartnerRecord.member_type !== "partner" ||
          existingPartnerRecord.linked_student_id !== student.id
        ) {
          await supabase
            .from("students")
            .update({
              member_type: "partner",
              linked_student_id: student.id,
              classification_source: "hubspot_partner_form",
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingPartnerRecord.id);
          partnerCreated = true;
        }
      } else {
        // Find or create contact for partner
        let partnerContactId: string | null = null;
        const { data: partnerContact } = await supabase
          .from("contacts")
          .select("id")
          .eq("email", partnerEmail)
          .maybeSingle();

        if (partnerContact) {
          partnerContactId = partnerContact.id;
        }

        // Create partner student record
        await supabase.from("students").insert({
          contact_id: partnerContactId,
          name: partnerEmail.split("@")[0],
          email: partnerEmail,
          program,
          status: "active",
          member_type: "partner",
          linked_student_id: student.id,
          signup_date: signupDate,
          monthly_revenue: 0,
          classification_source: "hubspot_partner_form",
          hubspot_segment: "ACTIVE: VRA Accelerator",
        });
        partnerCreated = true;
      }
    }

    // --- 7. Return student for downstream use ---
    return NextResponse.json(
      {
        student,
        contact_id: contactId,
        youtube_channel_normalized: youtubeChannel,
        is_new: !existingStudent,
        member_type: memberType,
        partner_created: partnerCreated,
      },
      { status: existingStudent ? 200 : 201 }
    );
  } catch (error) {
    console.error("[POST /api/students/sync]", error);
    return NextResponse.json(
      { error: "Failed to sync student" },
      { status: 500 }
    );
  }
}
