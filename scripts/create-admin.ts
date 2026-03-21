/**
 * Bootstrap script: Create the first admin user in Supabase.
 * Run once with: npx tsx scripts/create-admin.ts
 *
 * Uses environment variables from .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local
config({ path: resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const ADMIN_EMAIL = "brian@thinkmedia.com";
const ADMIN_PASSWORD = "mission2026!";
const ADMIN_NAME = "Brian Griffith";

async function main() {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log(`Creating admin user: ${ADMIN_EMAIL}`);

  // Create auth user
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true, // skip email verification for bootstrap
    });

  if (authError) {
    if (authError.message.includes("already been registered")) {
      console.log("User already exists in auth. Checking profile...");
      // Get existing user
      const { data: users } = await supabase.auth.admin.listUsers();
      const existingUser = users?.users.find((u) => u.email === ADMIN_EMAIL);
      if (existingUser) {
        await ensureProfile(supabase as any, existingUser.id);
      }
      return;
    }
    console.error("Auth error:", authError.message);
    process.exit(1);
  }

  console.log(`Auth user created: ${authData.user.id}`);

  await ensureProfile(supabase as any, authData.user.id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureProfile(supabase: any, userId: string) {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();

  if (existing) {
    console.log("Profile already exists. Done.");
    return;
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    email: ADMIN_EMAIL,
    full_name: ADMIN_NAME,
    role: "admin",
    program_scope: null,
  });

  if (profileError) {
    console.error("Profile error:", profileError.message);
    process.exit(1);
  }

  console.log("Profile created with role: admin");
  console.log("\n✓ Admin user ready!");
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log("\n  Change your password after first login.");
}

main().catch(console.error);
