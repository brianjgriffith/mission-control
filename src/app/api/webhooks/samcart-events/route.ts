import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// POST /api/webhooks/samcart-events
// Unified SamCart webhook endpoint — routes by event type to appropriate RPC.
// Always returns 200 so SamCart doesn't retry.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType: string = body.type || "";
    const supabase = createAdminClient();

    // ---- Order ----
    if (eventType === "Order") {
      const { data, error } = await supabase.rpc("upsert_samcart_charge", {
        p_samcart_transaction_id: body.id?.toString() || body.order_id?.toString() || "",
        p_customer_email: body.customer?.email || body.buyer_email || "",
        p_customer_first_name: body.customer?.first_name || body.buyer_first_name || "",
        p_customer_last_name: body.customer?.last_name || body.buyer_last_name || "",
        p_product_name: body.product?.name || body.product_name || "",
        p_amount: parseFloat(body.total || body.charge_amount || "0"),
        p_processor: body.processor || "SamCart",
        p_subscription_id: body.subscription_id?.toString() || "",
        p_affiliate_id: body.affiliate?.id?.toString() || "",
        p_affiliate_name: body.affiliate?.name || "",
        p_coupon_code: body.coupon?.code || "",
        p_order_date: body.created_at || body.order_date || "",
        p_event_type: "Order",
      });

      return NextResponse.json(
        { ok: true, type: "Order", result: data, error: error?.message || null },
        { status: 200 }
      );
    }

    // ---- Refund ----
    if (eventType === "Refund") {
      const { data, error } = await supabase.rpc("process_samcart_refund", {
        p_customer_email: body.customer?.email || body.buyer_email || "",
        p_product_name: body.product?.name || body.product_name || "",
        p_refund_amount: parseFloat(body.refund_amount || body.total || "0"),
        p_refund_date: body.refund_date || body.created_at || "",
        p_transaction_id: body.id?.toString() || body.order_id?.toString() || "",
      });

      return NextResponse.json(
        { ok: true, type: "Refund", result: data, error: error?.message || null },
        { status: 200 }
      );
    }

    // ---- Subscription lifecycle events ----
    if (
      eventType === "Subscription Canceled" ||
      eventType === "Subscription Payment Failed" ||
      eventType === "Subscription Restarted"
    ) {
      const { data, error } = await supabase.rpc("process_subscription_event", {
        p_customer_email: body.customer?.email || body.buyer_email || "",
        p_subscription_id: body.subscription_id?.toString() || "",
        p_event_type: eventType,
        p_product_name: body.product?.name || body.product_name || "",
        p_event_date: body.created_at || body.event_date || "",
      });

      return NextResponse.json(
        { ok: true, type: eventType, result: data, error: error?.message || null },
        { status: 200 }
      );
    }

    // ---- Unknown event type — acknowledge but log it ----
    console.warn(`[samcart-events] Unknown event type: "${eventType}"`);
    return NextResponse.json(
      { ok: true, type: eventType, skipped: true, reason: "Unrecognized event type" },
      { status: 200 }
    );
  } catch (err) {
    // Always return 200 for webhooks — log the error server-side
    console.error("[samcart-events] Webhook processing error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal processing error" },
      { status: 200 }
    );
  }
}
