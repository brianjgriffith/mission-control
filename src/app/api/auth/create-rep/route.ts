import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/create-rep
 * Admin-only: create a sales rep account with email + password.
 * Unlike invite (which sends an email), this creates the account directly
 * so the admin can hand the credentials to the rep.
 *
 * Body: { email, password, full_name, sales_rep_id }
 */
export async function POST(request: Request) {
  const currentUser = await getAuthUser();
  if (!currentUser || currentUser.profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { email, password, full_name, sales_rep_id } = body as {
    email: string;
    password: string;
    full_name: string;
    sales_rep_id: string;
  };

  if (!email || !password || !full_name || !sales_rep_id) {
    return NextResponse.json(
      { error: "Email, password, full_name, and sales_rep_id are required" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // 1. Create auth user with password (no email verification)
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    return NextResponse.json(
      { error: authError.message },
      { status: 400 }
    );
  }

  // 2. Create profile
  const { error: profileError } = await supabase.from("profiles").insert({
    id: authData.user.id,
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

  // 3. Link to sales_reps
  const { error: linkError } = await supabase
    .from("sales_reps")
    .update({ user_id: authData.user.id })
    .eq("id", sales_rep_id);

  if (linkError) {
    console.error("[create-rep] link error:", linkError.message);
  }

  // 4. Grant view access
  const views = ["sales", "meetings", "charges"];
  for (const view of views) {
    await supabase.from("user_view_access").upsert(
      { user_id: authData.user.id, view_name: view, can_write: true },
      { onConflict: "user_id,view_name" }
    );
  }

  return NextResponse.json({
    success: true,
    user_id: authData.user.id,
    email,
    full_name,
    role: "sales_rep",
  });
}
