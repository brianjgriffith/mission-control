# Kajabi Direct Sync — Evaluation

**Status:** Deferred
**Date:** 2026-03-26

## What Kajabi Data Already Flows Through HubSpot

Kajabi purchases are synced to HubSpot via an existing automation (Kajabi -> HubSpot charges). These charge records are then pulled into Mission Control through the same HubSpot charge sync pipeline used for all other HubSpot charges. The synced data includes:

- Charge amount (embedded in the title string)
- Product name / variant (embedded in the title string)
- Customer email (via HubSpot contact association)
- Charge date

This data arrives in the same format as other HubSpot charges and is parsed using the product title mapping table during sync.

## Would a Direct Kajabi Sync Add Value?

A direct Kajabi API integration could potentially provide:

- Structured product name and amount fields (avoiding title parsing)
- Subscription status and payment plan details
- Refund events with structured data

However, SamCart is the majority purchase source. Kajabi volume is comparatively low, and the existing HubSpot path already captures the core charge data needed for revenue tracking and attribution.

## Recommendation

**Defer direct Kajabi integration.** The existing Kajabi -> HubSpot -> Mission Control path is sufficient for Phase 1. Kajabi charges already arrive via HubSpot and are handled by the product title mapping table (migration 005/006 pattern).

If Kajabi purchase volume grows or if subscription lifecycle tracking becomes important for Kajabi products specifically, revisit this decision. At that point, a direct sync similar to the SamCart pipeline (webhook -> API route -> Supabase RPC) could be added.

This aligns with PRD open question #9: "Evaluate whether Kajabi's API provides richer purchase data than what arrives in HubSpot charges."
