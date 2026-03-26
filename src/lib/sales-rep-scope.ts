import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthUser } from "@/lib/auth";

/**
 * If the authenticated user is a sales_rep, resolve their sales_reps row ID.
 * Returns null for non-sales_rep roles (meaning "no restriction").
 * Returns the sales_rep UUID for sales_rep users.
 * Throws if a sales_rep user has no linked sales_reps row.
 */
export async function getSalesRepScope(
  user: AuthUser
): Promise<string | null> {
  if (user.profile.role !== "sales_rep") return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sales_reps")
    .select("id")
    .eq("user_id", user.profile.id)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Sales rep profile not linked. Contact an admin.");
  }

  return data.id;
}
