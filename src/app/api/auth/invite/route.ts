import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { user_role } from "@/lib/supabase/types";

/**
 * POST /api/auth/invite
 * Admin-only: invite a new user by email with a specified role.
 * Creates the auth user and profile in one step.
 */
export async function POST(request: Request) {
  const currentUser = await getAuthUser();
  if (!currentUser || currentUser.profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { email, full_name, role, program_scope } = body as {
    email: string;
    full_name: string;
    role: user_role;
    program_scope?: string[];
  };

  if (!email || !role) {
    return NextResponse.json(
      { error: "Email and role are required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Invite user via Supabase Auth (sends email with magic link)
  const { data: authData, error: authError } =
    await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role },
      redirectTo: `${request.headers.get("origin") ?? ""}/auth/callback`,
    });

  if (authError) {
    return NextResponse.json(
      { error: authError.message },
      { status: 400 }
    );
  }

  // Create the profile row (service role bypasses RLS)
  const { error: profileError } = await supabase.from("profiles").insert({
    id: authData.user.id,
    email,
    full_name: full_name || "",
    role,
    program_scope: program_scope ?? null,
  });

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    user_id: authData.user.id,
    email,
    role,
  });
}
