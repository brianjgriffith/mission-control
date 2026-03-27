import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("funnels")
      .select("*")
      .order("funnel_type")
      .order("name");

    if (error) throw error;
    return NextResponse.json({ funnels: data || [] });
  } catch (error) {
    console.error("[GET /api/funnels]", error);
    return NextResponse.json({ error: "Failed to fetch funnels" }, { status: 500 });
  }
}
