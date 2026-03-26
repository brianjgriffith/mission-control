/**
 * Backfill partner relationships from HubSpot.
 *
 * Logic:
 * 1. Find all HubSpot contacts with accelerator_partner_email set (61 students)
 * 2. For each, find the partner in our students table by email
 * 3. If the partner exists as a student, reclassify them as partner + link
 * 4. If the partner doesn't exist yet, check if they're in the contacts table
 *    and create a student record with member_type=partner
 *
 * Run with: npx tsx scripts/backfill-partners.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY!;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function hubspotPost(url: string, body: any): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log("=== Backfill Partner Relationships ===\n");

  // 1. Get all contacts with accelerator_partner_email from HubSpot
  let allStudentsWithPartners: Array<{
    studentEmail: string;
    studentName: string;
    studentHsId: string;
    partnerEmail: string;
  }> = [];

  let after: string | undefined;
  while (true) {
    const body: any = {
      limit: 100,
      properties: ["email", "firstname", "lastname", "accelerator_partner_email"],
      filterGroups: [{
        filters: [{
          propertyName: "accelerator_partner_email",
          operator: "HAS_PROPERTY",
        }],
      }],
    };
    if (after) body.after = after;

    const data = await hubspotPost(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      body
    );

    for (const r of data.results || []) {
      const p = r.properties;
      if (p.accelerator_partner_email) {
        allStudentsWithPartners.push({
          studentEmail: p.email || "",
          studentName: `${p.firstname || ""} ${p.lastname || ""}`.trim(),
          studentHsId: r.id,
          partnerEmail: p.accelerator_partner_email.trim().toLowerCase(),
        });
      }
    }

    after = data.paging?.next?.after;
    if (!after) break;
  }

  console.log(`Found ${allStudentsWithPartners.length} students with partners\n`);

  let partnersLinked = 0;
  let partnersCreated = 0;
  let partnersAlreadyCorrect = 0;
  let studentNotFound = 0;

  for (const sp of allStudentsWithPartners) {
    // Find the student in our DB
    const { data: student } = await supabase
      .from("students")
      .select("id, name, email, program")
      .eq("email", sp.studentEmail.toLowerCase())
      .eq("program", "accelerator")
      .maybeSingle();

    if (!student) {
      // Try by HubSpot contact ID → contact → student
      const { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("hubspot_contact_id", sp.studentHsId)
        .maybeSingle();

      if (contact) {
        const { data: studentByContact } = await supabase
          .from("students")
          .select("id, name, email, program")
          .eq("contact_id", contact.id)
          .eq("program", "accelerator")
          .maybeSingle();

        if (studentByContact) {
          await processPartner(studentByContact, sp.partnerEmail);
        } else {
          // Try matching by name (v1 students have no email/contact_id)
          const { data: studentByName } = await supabase
            .from("students")
            .select("id, name, email, program")
            .ilike("name", `%${sp.studentName.split(" ")[0]}%`)
            .eq("program", "accelerator")
            .maybeSingle();

          if (studentByName) {
            // Link the v1 student to the contact while we're at it
            await supabase
              .from("students")
              .update({ contact_id: contact.id, email: sp.studentEmail })
              .eq("id", studentByName.id);
            await processPartner(
              { ...studentByName, email: sp.studentEmail },
              sp.partnerEmail
            );
          } else {
            // Student not in MC at all — create them
            const { data: newStudent, error } = await supabase
              .from("students")
              .insert({
                contact_id: contact.id,
                name: sp.studentName || sp.studentEmail,
                email: sp.studentEmail,
                program: "accelerator",
                status: "active",
                member_type: "student",
                signup_date: new Date().toISOString().split("T")[0],
                monthly_revenue: 0,
                classification_source: "hubspot_partner_backfill",
                hubspot_segment: "ACTIVE: VRA Accelerator",
              })
              .select("id, name, email, program")
              .single();

            if (!error && newStudent) {
              console.log(`  Created student: ${sp.studentName} (${sp.studentEmail})`);
              await processPartner(newStudent, sp.partnerEmail);
            } else {
              studentNotFound++;
            }
          }
        }
      } else {
        studentNotFound++;
        continue;
      }
    } else {
      await processPartner(student, sp.partnerEmail);
    }
  }

  async function processPartner(
    student: { id: string; name: string; email: string; program: string },
    partnerEmail: string
  ) {
    // Check if partner already exists in students table
    const { data: existingPartner } = await supabase
      .from("students")
      .select("id, member_type, linked_student_id")
      .eq("email", partnerEmail)
      .eq("program", "accelerator")
      .maybeSingle();

    if (existingPartner) {
      if (existingPartner.member_type === "partner" && existingPartner.linked_student_id === student.id) {
        partnersAlreadyCorrect++;
        return;
      }

      // Update to partner + link
      await supabase
        .from("students")
        .update({
          member_type: "partner",
          linked_student_id: student.id,
          classification_source: "hubspot_partner_form",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPartner.id);

      partnersLinked++;
      console.log(`  Linked: ${partnerEmail} → partner of ${student.name}`);
    } else {
      // Partner not in students table — check contacts
      const { data: partnerContact } = await supabase
        .from("contacts")
        .select("id")
        .eq("email", partnerEmail)
        .maybeSingle();

      // Create partner student record
      const { error } = await supabase.from("students").insert({
        contact_id: partnerContact?.id || null,
        name: partnerEmail.split("@")[0], // Placeholder name
        email: partnerEmail,
        program: "accelerator",
        status: "active",
        member_type: "partner",
        linked_student_id: student.id,
        signup_date: new Date().toISOString().split("T")[0],
        monthly_revenue: 0,
        classification_source: "hubspot_partner_form",
        hubspot_segment: "ACTIVE: VRA Accelerator",
      });

      if (!error) {
        partnersCreated++;
        console.log(`  Created: ${partnerEmail} → partner of ${student.name}`);
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Partners already correct: ${partnersAlreadyCorrect}`);
  console.log(`Partners linked (reclassified): ${partnersLinked}`);
  console.log(`Partners created (new records): ${partnersCreated}`);
  console.log(`Students not found in MC: ${studentNotFound}`);
  console.log("\nDone!");
}

main().catch(console.error);
