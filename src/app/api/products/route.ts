import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// POST /api/products
// Create a new product + optionally assign unmatched charges to it.
// Body: { name, short_name?, group_name?, product_type?, assign_pattern? }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const {
      name,
      short_name,
      group_name,
      product_type,
      assign_pattern,
    } = body as {
      name: string;
      short_name?: string;
      group_name?: string;
      product_type?: string;
      assign_pattern?: string;
    };

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Create the product
    const { data: product, error: prodError } = await supabase
      .from("products")
      .insert({
        name,
        short_name: short_name || name,
        group_name: group_name || null,
        product_type: product_type || "other",
        is_active: true,
      })
      .select()
      .single();

    if (prodError) {
      if (prodError.message.includes("duplicate")) {
        return NextResponse.json({ error: "A product with this name already exists" }, { status: 409 });
      }
      throw prodError;
    }

    let chargesUpdated = 0;

    // If a pattern is provided, create a title mapping and assign charges
    if (assign_pattern && product) {
      // Create title mapping
      await supabase
        .from("product_title_mappings")
        .upsert(
          {
            product_id: product.id,
            title_pattern: assign_pattern,
            match_type: "contains",
            priority: 50,
          },
          { onConflict: "title_pattern,match_type" }
        );

      // Assign unmatched charges
      const { data: result } = await supabase.rpc("assign_product_to_charges", {
        pattern: assign_pattern,
        target_product_id: product.id,
        mapping_priority: 50,
      });

      chargesUpdated = result?.charges_updated || 0;
    }

    return NextResponse.json({
      product,
      charges_updated: chargesUpdated,
    });
  } catch (error) {
    console.error("[POST /api/products]", error);
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 }
    );
  }
}
