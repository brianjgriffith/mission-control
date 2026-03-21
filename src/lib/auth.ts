import { createClient } from "@/lib/supabase/server";
import type { user_role } from "@/lib/supabase/types";

export interface AuthUser {
  authId: string;
  email: string;
  profile: {
    id: string;
    email: string;
    full_name: string;
    role: user_role;
    program_scope: string[] | null;
    avatar_url: string;
    is_active: boolean;
  };
}

/**
 * Get the authenticated user and their profile.
 * Returns null if not authenticated or profile doesn't exist.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) return null;
  if (!profile.is_active) return null;

  return {
    authId: user.id,
    email: user.email ?? "",
    profile: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role as user_role,
      program_scope: profile.program_scope,
      avatar_url: profile.avatar_url ?? "",
      is_active: profile.is_active,
    },
  };
}
