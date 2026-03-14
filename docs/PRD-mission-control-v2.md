# Mission Control v2 — Product Requirements Document

**Date:** 2026-03-10
**Author:** Brian Griffith
**Status:** Draft

---

## Executive Summary

Mission Control is Think Media's internal business intelligence dashboard. Today it runs locally with SQLite and requires manual data entry for sales, students, marketing, and financials. The vision for v2 is to transform it into an automated, cloud-hosted executive platform that pulls real-time data from HubSpot (and potentially SamCart), tracks the full customer journey from funnel opt-in to purchase (and beyond), and presents it all in a way that's actually usable — something HubSpot itself fails to do well.

---

## Problems We're Solving

1. **Manual data entry is unsustainable.** Every sales figure, student enrollment, and deal is hand-entered. This doesn't scale and introduces human error.
2. **HubSpot has the data but it's unusable.** The data lives in HubSpot but extracting insights requires expertise and patience nobody has time for.
3. **No customer journey visibility.** We can't answer: "Someone opted into Funnel X — did they buy? How long did it take? What did they buy first? Did they buy again?"
4. **No purchase intelligence.** We don't track first purchase vs. repeat, speed to purchase, or lifetime purchase history in any accessible way.
5. **No access control.** The app runs locally on one machine. The executive team needs secure, shared access.

---

## Target Users

| Role | Access Level | Primary Use |
|------|-------------|-------------|
| Executive Team | Full read access, all views | Strategic decisions, revenue health, funnel performance |
| Director of Coaching | Students, coaches, churn, capacity | Coaching operations, retention, staffing |
| Sales Manager | Sales, deals, rep performance | Sales team performance, quotas, pipeline |
| Marketing Lead | Marketing, funnels, cohorts | Funnel performance, conversion rates, attribution |
| Admin (Brian) | Full access + settings | System configuration, user management |

---

## Architecture Overview

### Current State
```
Manual Entry --> SQLite (local file) --> Next.js Dashboard
```

### Target State
```
SamCart (purchases) --> HubSpot (CRM) --> n8n (sync engine) --> Supabase (cloud DB) --> Next.js Dashboard
Lead Magnets / Quizzes / Web Classes --> HubSpot --> n8n --> Supabase --> Next.js Dashboard
```

### Key Architectural Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Database | Supabase (PostgreSQL) | Cloud-hosted, RLS for auth, real-time subscriptions, already used in Channel Audits |
| Sync Engine | n8n | Already in our stack, handles webhooks and scheduled syncs, visual workflow builder |
| Primary Data Source | HubSpot | All purchases flow through SamCart -> HubSpot already. Contacts, deals, and lifecycle stages live here |
| Auth | Supabase Auth | Email/password for executive team, role-based access |
| Hosting | Vercel | Already deploying Channel Audits here |

### HubSpot vs. SamCart as Data Source

HubSpot is the recommended primary source because:
- SamCart charges already sync to HubSpot (this flow exists today)
- HubSpot has contact lifecycle data, funnel opt-ins, and deal stages — SamCart only has transactions
- HubSpot has form submissions (lead magnets, quiz completions, web class registrations)
- One integration point instead of two

SamCart direct integration may be needed later only if HubSpot doesn't capture specific transaction metadata (payment plan details, partial refunds, etc.).

---

## Feature Phases

### Phase 0: Foundation (Prerequisites)

**Goal:** Move from local SQLite to cloud infrastructure with auth.

- [ ] Design Supabase schema (migrate from SQLite, add new tables for journey tracking)
- [ ] Set up Supabase project with RLS policies
- [ ] Implement Supabase Auth (email/password, invite-only)
- [ ] Role-based access control (admin, executive, manager roles)
- [ ] Deploy to Vercel
- [ ] Migrate existing manual data to Supabase
- [ ] Environment variable setup (HubSpot API key, Supabase creds)

**Outcome:** Executive team can log in and see the existing dashboard views with current data, hosted in the cloud.

---

### Phase 1: HubSpot Sales Sync (Replace Manual Sales Entry)

**Goal:** Automatically pull all purchase data from HubSpot so nobody types sales numbers again.

#### Data to Sync
- **Deals** (HubSpot Deals pipeline)
  - Deal amount, close date, deal stage, associated contact
  - Product/line items (Elite, Accelerator, VRA, etc.)
  - Deal owner (maps to sales rep)
  - New vs. recurring (deal property or custom property)
- **Contacts** (associated with deals)
  - Name, email, lifecycle stage
  - First conversion date, recent conversion date
- **Payments/Revenue**
  - Monthly recurring revenue per product
  - Refund events
  - Payment plan type

#### n8n Workflows
1. **Scheduled Full Sync** (daily) — Pull all deals updated in last 24h, upsert to Supabase
2. **Webhook Real-Time Sync** — HubSpot webhook on deal stage change or new deal creation, push to Supabase immediately
3. **Historical Backfill** (one-time) — Pull all historical deals to populate past months

#### Dashboard Changes
- Sales view auto-populated (read-only for synced data, manual override flag for corrections)
- "Last synced" timestamp visible
- Sync status indicator (healthy/stale/error)
- Keep manual entry as fallback for edge cases

**Outcome:** Sales tab shows real revenue data without anyone entering it.

---

### Phase 2: Student & Enrollment Sync

**Goal:** Automatically track student enrollments, cancellations, and status changes.

#### Data to Sync
- **Contact lifecycle stage changes** — When a contact becomes a "Customer" in HubSpot
- **Deal-to-enrollment mapping** — Closed deal = new student enrollment
- **Subscription status** — Active, cancelled, paused (from HubSpot or SamCart webhook)
- **Coach assignment** — Custom HubSpot property or manual assignment in Mission Control
- **Program** — Derived from product/deal line item

#### n8n Workflows
1. **New Enrollment Trigger** — Deal closes -> create student record in Supabase, set status to active
2. **Cancellation/Pause Trigger** — Subscription status change in HubSpot -> log churn event, update student status
3. **Daily Reconciliation** — Compare HubSpot active subscriptions vs. Supabase student statuses, flag mismatches

#### Dashboard Changes
- Students auto-created when deals close
- Churn events auto-logged from subscription changes
- Manual fields remain for coach assignment, notes, attendance (these aren't in HubSpot)

**Outcome:** Student roster stays current without manual enrollment tracking.

---

### Phase 3: Funnel & Journey Tracking (The Big One)

**Goal:** Track the full journey from funnel opt-in to purchase, with speed and conversion metrics.

#### What We're Tracking

```
Funnel Entry (opt-in) --> Engagement --> Purchase --> Repeat Purchase
     |                       |              |              |
  Lead Magnet           Web Class       First Buy      Upsell/Cross-sell
  Quiz                  Email Opens     Product X      Product Y
  Web Class Reg         Page Visits     Amount         Amount
  Ad Click              Call Booked     Days to Buy    Days Between
```

#### New Data Model: Journey Events

Every meaningful touchpoint becomes a **journey event** on a contact's timeline:

| Field | Description |
|-------|-------------|
| contact_id | HubSpot contact ID (foreign key) |
| event_type | `opt_in`, `webclass_registered`, `webclass_attended`, `quiz_completed`, `call_booked`, `call_completed`, `purchase`, `refund`, `cancel`, `pause`, `restart`, `upsell` |
| event_date | When it happened |
| source | Which funnel/lead magnet/quiz/ad |
| product | If purchase-related, which product |
| amount | If financial, the dollar amount |
| metadata | JSON blob for extra context (UTM params, quiz answers, etc.) |

#### Key Metrics to Derive

1. **Funnel-to-Purchase Conversion Rate**
   - "Of everyone who opted into Lead Magnet X, what % eventually purchased?"
   - Filterable by time period, product, funnel

2. **Speed to Purchase**
   - Days between first funnel opt-in and first purchase
   - Median, average, distribution histogram
   - By funnel, by product

3. **First Purchase vs. Repeat**
   - Is this contact's first-ever purchase or have they bought before?
   - Total lifetime purchases per contact
   - Time between purchases

4. **Funnel Attribution**
   - Which funnel drove the most revenue?
   - Which funnel has the fastest speed to purchase?
   - Which funnel produces the most repeat buyers?

5. **Journey Path Analysis**
   - Most common paths: e.g., "Quiz -> Web Class -> Call -> Purchase" vs. "Lead Magnet -> Purchase"
   - Drop-off points in each funnel

#### HubSpot Data Sources for Journey Events

| Event | HubSpot Source |
|-------|---------------|
| Lead magnet opt-in | Form submission (specific form IDs) |
| Quiz completion | Form submission or workflow enrollment |
| Web class registration | Form submission or list membership |
| Web class attendance | Custom property set by webinar platform integration |
| Call booked | Meeting link activity or deal stage = "Call Booked" |
| Call completed | Deal stage = "Call Completed" or meeting outcome |
| Purchase | Deal closed-won |
| Cancellation | Deal property change or subscription webhook |

#### n8n Workflows
1. **Form Submission Listener** — HubSpot webhook on form submit -> classify event type -> write journey event to Supabase
2. **Deal Stage Change Listener** — Track progression through deal pipeline as journey events
3. **Historical Journey Backfill** — Pull contact timelines from HubSpot API to reconstruct past journeys
4. **Daily Metrics Aggregation** — Compute conversion rates, speed-to-purchase, cohort metrics -> write to summary tables for fast dashboard queries

#### Dashboard: New "Journeys" View

- **Funnel Performance Table** — Each funnel as a row: opt-ins, conversions, conversion rate, avg speed to purchase, revenue attributed
- **Journey Timeline** — Click any contact to see their full event timeline
- **Cohort Analysis** — Group by opt-in month: "Of March 2026 opt-ins, X% purchased within 30/60/90 days"
- **Speed to Purchase Distribution** — Histogram showing how long it takes people to buy
- **First vs. Repeat Breakdown** — Pie/bar chart of first-time buyers vs. returning customers by period
- **Attribution Sankey Diagram** — Visual flow from funnel -> product purchased

**Outcome:** The executive team can answer "Which funnels actually drive revenue, how fast, and how often do those customers come back?"

---

### Phase 4: Advanced Analytics & Reporting

**Goal:** Layer on deeper intelligence once the data pipeline is solid.

- **LTV Prediction** — Based on purchase history and engagement patterns, estimate customer lifetime value
- **Churn Risk Scoring** — Flag students likely to cancel based on attendance, engagement drop-off
- **Revenue Forecasting** — Project future MRR based on trends, seasonality, pipeline
- **Automated Alerts** — n8n sends Slack/email when: churn spike detected, funnel conversion drops below threshold, rep misses quota
- **Scheduled Reports** — Weekly executive summary email with key metrics (generated by n8n, sent via email)
- **CSV/PDF Export** — Download any view as CSV or formatted PDF

---

## Database Schema Additions (Supabase)

### New Tables

```sql
-- Contacts (synced from HubSpot)
contacts (
  id uuid PRIMARY KEY,
  hubspot_id text UNIQUE NOT NULL,
  email text,
  name text,
  lifecycle_stage text,
  first_conversion_date timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)

-- Journey Events (the core of Phase 3)
journey_events (
  id uuid PRIMARY KEY,
  contact_id uuid REFERENCES contacts(id),
  event_type text NOT NULL,  -- opt_in, purchase, cancel, etc.
  event_date timestamptz NOT NULL,
  source text,               -- funnel name, lead magnet name, etc.
  product text,              -- if purchase-related
  amount numeric,            -- if financial
  metadata jsonb,            -- flexible extra data
  hubspot_source_id text,    -- original HubSpot record ID for dedup
  created_at timestamptz
)

-- Funnels (reference table)
funnels (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  funnel_type text,          -- lead_magnet, quiz, webclass, ad
  hubspot_form_id text,      -- maps to HubSpot form
  active boolean DEFAULT true,
  created_at timestamptz
)

-- Sync Log (track n8n sync health)
sync_log (
  id uuid PRIMARY KEY,
  sync_type text NOT NULL,   -- deals, contacts, forms, etc.
  status text NOT NULL,      -- success, error, partial
  records_processed integer,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz
)

-- Aggregated Metrics (precomputed for dashboard speed)
funnel_metrics (
  id uuid PRIMARY KEY,
  funnel_id uuid REFERENCES funnels(id),
  period text,               -- YYYY-MM
  opt_ins integer,
  conversions integer,
  conversion_rate numeric,
  avg_speed_to_purchase numeric,  -- days
  median_speed_to_purchase numeric,
  total_revenue numeric,
  first_time_buyers integer,
  repeat_buyers integer,
  computed_at timestamptz
)
```

### Modified Tables (migrated from SQLite)
- `students` — add `hubspot_contact_id`, `hubspot_deal_id` columns
- `rep_sales` — add `synced_from_hubspot` boolean, `hubspot_deal_ids` text array
- `deals` — add `hubspot_deal_id` unique column for dedup

---

## n8n Workflow Summary

| # | Workflow | Trigger | Frequency | Phase |
|---|----------|---------|-----------|-------|
| 1 | Deal Sync | HubSpot webhook + daily schedule | Real-time + daily | 1 |
| 2 | Historical Deal Backfill | Manual trigger | One-time | 1 |
| 3 | Contact Sync | HubSpot webhook + daily schedule | Real-time + daily | 1 |
| 4 | Enrollment Sync | Deal closed-won webhook | Real-time | 2 |
| 5 | Subscription Status Sync | HubSpot/SamCart webhook | Real-time | 2 |
| 6 | Daily Student Reconciliation | Cron | Daily | 2 |
| 7 | Form Submission Listener | HubSpot webhook | Real-time | 3 |
| 8 | Journey Event Logger | Multiple triggers | Real-time | 3 |
| 9 | Historical Journey Backfill | Manual trigger | One-time | 3 |
| 10 | Daily Metrics Aggregation | Cron | Daily | 3 |
| 11 | Alert & Report Generator | Cron + threshold triggers | Daily/weekly | 4 |

---

## Implementation Order & Dependencies

```
Phase 0: Foundation
  |-- Supabase setup, auth, deploy to Vercel
  |-- Migrate existing data
  |
Phase 1: Sales Sync (depends on Phase 0)
  |-- HubSpot API connection via n8n
  |-- Deal sync workflows
  |-- Sales view reads from Supabase instead of SQLite
  |
Phase 2: Student Sync (depends on Phase 1)
  |-- Enrollment auto-creation from deals
  |-- Churn event auto-logging
  |-- Student view reads from Supabase
  |
Phase 3: Journey Tracking (depends on Phase 1 + 2)
  |-- Journey events schema
  |-- Form submission tracking
  |-- New Journeys dashboard view
  |-- Funnel attribution + speed metrics
  |
Phase 4: Advanced (depends on Phase 3)
  |-- Forecasting, alerts, exports
```

---

## Open Questions

1. **HubSpot Custom Properties** — ✅ ANSWERED: There is a custom property on contacts called "charges." For the few purchases that happen directly in HubSpot, the built-in payment properties are used. A full audit of the HubSpot schema is still recommended before building the sync.
2. **SamCart Data Gap** — ⏳ PARTIALLY ANSWERED: HubSpot does not capture SamCart data extremely well. Brian will provide specifics on what's included vs. missing. A direct SamCart integration may be needed for Phase 2.
3. **Historical Data Depth** — ✅ ANSWERED: All-time. Pull all available data from HubSpot, including data from older purchase services that fed into HubSpot.
4. **Funnel Inventory** — ⏳ PENDING: Brian will provide the complete list of active funnels, lead magnets, quizzes, and web class registration forms with their HubSpot form IDs.
5. **Coach Assignment** — ✅ ANSWERED: Coach assignments are tracked in Notion, not HubSpot. A separate Accelerator Hub app is being built for coaches to use with clients, which may serve as the future source for coach assignment data. For now, keep manual assignment in Mission Control.
6. **Web Class Attendance** — ✅ ANSWERED: Web class attendance is not currently tracked. Zoom is used for web classes (not RSVP). Tracking attendance via Zoom API integration could be a future enhancement.
7. **Access Scope** — ✅ ANSWERED: Executives can see all data. No view-level restrictions needed — full read access for all authenticated users.
8. **Existing Priority Bugs** — ⏳ PENDING: Brian needs to review the bugs and priorities in SALES_PRIORITIES.md and STUDENT-PRIORITIES.md before deciding on timing relative to the Supabase migration.

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time spent on manual data entry | ~2-3 hrs/week | < 15 min/week (edge cases only) |
| Data freshness | Updated when someone remembers | Real-time (< 5 min delay) |
| "Can you tell me which funnel drove the most revenue?" | "Let me dig through HubSpot for an hour" | 10-second dashboard lookup |
| Executive team access | Brian's laptop only | Any authorized user, any device |
| Speed to answer "did they buy?" | Manual cross-referencing | Instant journey timeline |

---

## Risks

| Risk | Mitigation |
|------|------------|
| HubSpot API rate limits | n8n handles retry/backoff; daily batch sync as fallback |
| Dirty/inconsistent HubSpot data | Data cleaning step in n8n workflows; validation rules in Supabase |
| Scope creep on journey tracking | Ship Phase 1-2 first, validate value before building Phase 3 |
| Migration data loss | Run SQLite and Supabase in parallel during transition |
| n8n downtime | Sync log table surfaces issues; daily reconciliation catches gaps |
