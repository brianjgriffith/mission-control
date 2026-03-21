import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/admin/unmatched
// Returns grouped unmatched charges with counts and revenue.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("get_unmatched_charge_groups");
    if (error) throw error;

    // Also fetch all products for the assignment dropdown
    const { data: products } = await supabase
      .from("products")
      .select("id, name, short_name, group_name")
      .order("group_name", { ascending: true })
      .order("name", { ascending: true });

    return NextResponse.json({
      ...data,
      products: products || [],
    });
  } catch (error) {
    console.error("[GET /api/admin/unmatched]", error);
    return NextResponse.json(
      { error: "Failed to fetch unmatched charges" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/unmatched
// Assign a product to unmatched charges matching a title pattern.
// Body: { pattern: string, product_id: string, priority?: number }
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const { pattern, product_id, priority } = body as {
      pattern: string;
      product_id: string;
      priority?: number;
    };

    if (!pattern || !product_id) {
      return NextResponse.json(
        { error: "pattern and product_id are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("assign_product_to_charges", {
      pattern,
      target_product_id: product_id,
      mapping_priority: priority ?? 50,
    });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("[POST /api/admin/unmatched]", error);
    return NextResponse.json(
      { error: "Failed to assign product" },
      { status: 500 }
    );
  }
}
