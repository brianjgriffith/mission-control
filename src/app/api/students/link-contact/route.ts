import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY!;

// ---------------------------------------------------------------------------
// POST /api/students/link-contact
// Search HubSpot by email, find/create the contact, link to student.
// Body: { student_id: string, email: string }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { student_id, email } = (await request.json()) as {
      student_id: string;
      email: string;
    };

    if (!student_id || !email) {
      return NextResponse.json({ error: "student_id and email required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Search HubSpot for this email
    const hsRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        limit: 1,
        properties: ["email", "firstname", "lastname"],
        filterGroups: [{
          filters: [{ propertyName: "email", operator: "EQ", value: cleanEmail }],
        }],
      }),
    });

    const hsData = await hsRes.json();
    const hsContact = hsData.results?.[0];

    if (!hsContact) {
      return NextResponse.json({ error: "Email not found in HubSpot" }, { status: 404 });
    }

    // Find or create contact in Supabase
    let contactId: string;

    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("hubspot_contact_id", hsContact.id)
      .maybeSingle();

    if (existing) {
      contactId = existing.id;
    } else {
      const { data: byEmail } = await supabase
        .from("contacts")
        .select("id")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (byEmail) {
        contactId = byEmail.id;
      } else {
        const { data: newContact, error } = await supabase
          .from("contacts")
          .insert({
            hubspot_contact_id: hsContact.id,
            email: cleanEmail,
            first_name: hsContact.properties.firstname || "",
            last_name: hsContact.properties.lastname || "",
          })
          .select("id")
          .single();

        if (error) throw error;
        contactId = newContact.id;
      }
    }

    // Link student to contact
    const { error: linkError } = await supabase
      .from("students")
      .update({ contact_id: contactId, email: cleanEmail })
      .eq("id", student_id);

    if (linkError) throw linkError;

    return NextResponse.json({
      success: true,
      contact_id: contactId,
      email: cleanEmail,
      hubspot_name: `${hsContact.properties.firstname || ""} ${hsContact.properties.lastname || ""}`.trim(),
    });
  } catch (error) {
    console.error("[POST /api/students/link-contact]", error);
    return NextResponse.json({ error: "Failed to link contact" }, { status: 500 });
  }
}
