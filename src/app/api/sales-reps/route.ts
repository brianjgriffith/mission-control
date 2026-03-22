import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("sales_reps")
      .select("id, name, email, rep_type, is_active")
      .eq("is_active", true)
      .order("rep_type")
      .order("name");

    if (error) throw error;
    return NextResponse.json({ reps: data || [] });
  } catch (error) {
    console.error("[GET /api/sales-reps]", error);
    return NextResponse.json({ error: "Failed to fetch sales reps" }, { status: 500 });
  }
}
