import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/invite-rep
 * Admin-only: invite a sales rep by email.
 * Creates auth user (role=sales_rep), profile, links sales_reps.user_id,
 * and grants view access to sales, meetings, charges.
 */
export async function POST(request: Request) {
  const currentUser = await getAuthUser();
  if (!currentUser || currentUser.profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { email, full_name, sales_rep_id } = body as {
    email: string;
    full_name: string;
    sales_rep_id: string;
  };

  if (!email || !full_name || !sales_rep_id) {
    return NextResponse.json(
      { error: "email, full_name, and sales_rep_id are required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Verify sales rep exists
  const { data: rep, error: repError } = await supabase
    .from("sales_reps")
    .select("id, name")
    .eq("id", sales_rep_id)
    .single();

  if (repError || !rep) {
    return NextResponse.json(
      { error: "Sales rep not found" },
      { status: 404 }
    );
  }

  // 1. Invite auth user
  const { data: authData, error: authError } =
    await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role: "sales_rep" },
      redirectTo: `${request.headers.get("origin") ?? ""}/auth/callback`,
    });

  if (authError) {
    return NextResponse.json(
      { error: authError.message },
      { status: 400 }
    );
  }

  const userId = authData.user.id;

  // 2. Create profile
  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    email,
    full_name,
    role: "sales_rep",
    program_scope: null,
  });

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message },
      { status: 500 }
    );
  }

  // 3. Link sales_reps.user_id
  const { error: linkError } = await supabase
    .from("sales_reps")
    .update({ user_id: userId })
    .eq("id", sales_rep_id);

  if (linkError) {
    return NextResponse.json(
      { error: linkError.message },
      { status: 500 }
    );
  }

  // 4. Grant view access
  const views = ["sales", "meetings", "charges"];
  const viewRows = views.map((view) => ({
    user_id: userId,
    view_name: view,
  }));

  const { error: viewError } = await supabase
    .from("user_view_access")
    .insert(viewRows);

  if (viewError) {
    console.error("[invite-rep] view access error:", viewError.message);
    // Non-fatal — the user is still created
  }

  return NextResponse.json({
    success: true,
    user_id: userId,
    email,
    sales_rep_id,
    role: "sales_rep",
  });
}
