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

## Current Features: Carry Forward vs. Deprecate

Not everything in Mission Control v1 belongs in v2. Some features were built for personal use or rely on manual entry that won't scale. This table clarifies what carries forward and what doesn't.

| Current Feature | v2 Status | Notes |
|----------------|-----------|-------|
| Sales dashboard | ✅ Carry forward | Will be auto-populated from HubSpot charges + SamCart direct sync |
| Students dashboard | ✅ Carry forward | Will be auto-populated from enrollment detection |
| Marketing — Jake Berman funnel machine | ❌ Deprecate | Personal tool for Brian, relies on manual entry. May be rebuilt later with a direct GHL (GoHighLevel) integration to pull data automatically, but not part of v2 scope |
| Projects tracker | ❌ Deprecate | May be recreated later but not part of v2 scope |
| Marketing — Think Media funnels | ✅ Carry forward | Will be rebuilt with HubSpot segment auto-discovery and journey tracking |

*Features marked for deprecation will remain accessible in v1 but will not be migrated to the Supabase-backed v2.*

---

## Target Users

| Role | Access Level | Primary Use |
|------|-------------|-------------|
| Executive Team | Full read access, all views | Strategic decisions, revenue health, funnel performance |
| Director of Coaching | Students, coaches, churn, capacity | Coaching operations, retention, staffing |
| Sales Manager | Sales, deals, rep performance, all meetings | Sales team performance, quotas, pipeline, lead quality |
| Sales Rep | Own sales, own meetings + outcome tagging | Log meeting outcomes, view personal performance |
| Marketing Lead | Marketing, funnels, cohorts | Funnel performance, conversion rates, attribution |
| Accelerator Program Manager | Accelerator students, enrollments, program metrics | Program health, student progress, churn for Accelerator |
| Elite Program Manager *(future)* | Elite students, enrollments, program metrics | Program health, student progress, churn for Elite |
| Custom Viewer | Assignable per-view read access | One-off roles needing specific dashboard views |
| Admin (Brian) | Full access + settings + permissions | System configuration, user management, role assignment |

---

## Architecture Overview

### Current State
```
Manual Entry --> SQLite (local file) --> Next.js Dashboard
```

### Target State
```
SamCart (purchases) ---+--> HubSpot (CRM) -----> n8n (sync engine) --> Supabase (cloud DB) --> Next.js Dashboard
                       |                                                       ^
                       +--> n8n (direct sync) ---------------------------------+
                            (richer data: affiliates, payment plans, refund details)

Kajabi (purchases) ----+--> HubSpot (CRM) -----> (same charge sync as above)
                       |                                                       ^
                       +--> n8n (direct sync) ---------------------------------+
                            (evaluate if Kajabi API provides richer data than HubSpot charges)

Lead Magnets / Quizzes / Web Classes --> HubSpot --> n8n --> Supabase --> Next.js Dashboard
```

**Dual-path purchase sync:** Existing platform→HubSpot automations remain in place for CRM purposes. Separate direct platform→n8n→Supabase workflows feed Mission Control with richer purchase data that may not survive the trip through HubSpot. Deduplication in n8n uses charge IDs to prevent double-counting.

**Purchase platforms:**
| Platform | Current HubSpot Sync | Direct Sync Strategy |
|----------|---------------------|----------------------|
| SamCart | Existing automation → HubSpot charges | Direct sync planned — richer data: affiliates, payment plans, refunds, subscription status |
| Kajabi | Existing automation → HubSpot charges | Evaluate Kajabi API — if it offers richer data than what lands in HubSpot, add a direct sync; otherwise HubSpot path is sufficient |
| HubSpot (direct purchases) | Native — uses built-in payment properties | Sync directly from HubSpot payment properties |

### Key Architectural Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Database | Supabase (PostgreSQL) | Cloud-hosted, RLS for auth, real-time subscriptions, already used in Channel Audits |
| Sync Engine | n8n | Already in our stack, handles webhooks and scheduled syncs, visual workflow builder |
| Primary Data Source | HubSpot | All purchases from various platforms land in HubSpot as "charges" (custom object). Contacts and segments live here |
| Auth | Supabase Auth | Email/password for executive team, role-based access |
| Hosting | Vercel | Already deploying Channel Audits here |

### HubSpot Charges as Purchase Source

Purchases are **not** tracked via HubSpot Deals. Instead, purchases from multiple platforms (SamCart, Kajabi, and direct HubSpot payments) land in HubSpot as a **custom object called "Charges"**, associated with contacts. This is the authoritative source for purchase data. Charges are created automatically by a HubSpot workflow ("[TMG] Charge form submitted → Create Charge record"). The charge title follows the format **"PRODUCT - Variant - email - $Amount"** — e.g., "February 2026 Think Media Mastermind - Discount - hello@deedeeparadis.com - $1,500.00".

#### What a HubSpot Charge Record Contains
| Field | Example | Notes |
|-------|---------|-------|
| Title | February 2026 Think Media Mastermind - Discount - email - $1,500.00 | Product name, variant, and amount embedded in string |
| Amount | $1,500.00 | Structured field |
| Contact Email | hello@deedeeparadis.com | |
| Associated Contact | Dee Dee Paradis | Linked via HubSpot association |
| Object create date/time | 12/16/2025 9:03 AM PST | When the charge was created |
| Record ID | 43270225328 | HubSpot internal ID |
| Record source | Workflow | Created by "[TMG] Charge form submitted" workflow |

#### What HubSpot Charge Records Do NOT Contain (SamCart Gap)
These fields are available in SamCart but do not survive the sync to HubSpot:
- Payment plan type (one-time vs. installments)
- Affiliate/sales rep attribution
- Subscription status (active, cancelled, paused)
- Refund events or partial refunds
- SamCart transaction ID
- New vs. recurring purchase flag
- Structured discount/coupon data (discount info is baked into the product name string)

**This gap is why the direct SamCart→n8n→Supabase sync is needed** (see Target State architecture).

Customer identification uses HubSpot **segments** (not lifecycle stages). Segments determine whether a contact is a customer and what products they're associated with.

HubSpot is the recommended primary source because:
- Charges from various purchase platforms already sync to HubSpot (this flow exists today)
- HubSpot has contact lifecycle data, funnel opt-ins, and form submissions
- One integration point instead of many

### Sales Attribution

Currently, sales team attribution is tracked via **SamCart affiliate sales** — each rep's affiliate link ties a purchase to a rep. However, some sales happen on other platforms and must be manually attributed.

**Goal for Mission Control:** Track every sale and enable sales attribution directly in Mission Control. For SamCart purchases, affiliate data provides automatic attribution. For purchases on other platforms, Mission Control should allow manual attribution to a sales rep. This eliminates the need to cross-reference multiple systems to understand team performance.

---

## Feature Phases

### Phase 0: Foundation (Prerequisites)

**Goal:** Move from local SQLite to cloud infrastructure with auth.

- [ ] Design Supabase schema (migrate from SQLite, add new tables for journey tracking)
- [ ] Set up Supabase project with RLS policies
- [ ] Implement Supabase Auth (email/password, invite-only)
- [ ] Role-based access control with program-scoped permissions
  - Core roles: admin, executive, manager (sales, marketing, coaching)
  - Program-scoped roles: program managers see only their program's student/enrollment/metric data
  - Custom Viewer role: admin can assign per-view read access for one-off roles
  - Sales Rep role: scoped to own meetings and own sales data, with write access to tag meeting outcomes
  - Permission model should be additive (grant access to views) rather than subtractive, making it easy to add new roles without reworking existing ones
- [ ] Deploy to Vercel
- [ ] Migrate existing manual data to Supabase
- [ ] Environment variable setup (HubSpot API key, Supabase creds)

**Outcome:** Executive team can log in and see the existing dashboard views with current data, hosted in the cloud.

---

### Phase 1: HubSpot Purchase Sync (Replace Manual Sales Entry)

**Goal:** Automatically pull all purchase data from HubSpot charges and enable sales team attribution so nobody types sales numbers again.

#### Data to Sync
- **Charges** (HubSpot custom object on contacts)
  - Charge amount, date, product purchased (Elite, Accelerator, VRA, etc.)
  - Source platform (SamCart, Kajabi, HubSpot direct)
  - New vs. recurring
- **Contacts** (associated with charges)
  - Name, email, segment membership
  - First conversion date, recent conversion date
- **Affiliate/Sales Attribution**
  - SamCart affiliate sales data — auto-attribute purchases to reps via affiliate links
  - Manual attribution support — for purchases on platforms without affiliate tracking
- **Payments/Revenue**
  - Monthly recurring revenue per product
  - Refund events
  - Payment plan type
- **Meetings** (HubSpot Meetings API)
  - Scheduled meetings synced per sales rep
  - Meeting date, time, associated contact, booking source
  - Outcome tagging (managed in Mission Control, not HubSpot):
    - `Completed` — meeting happened
    - `No Show` — lead didn't show up
    - `Rescheduled` — moved to a new time
    - `Not Qualified` — lead isn't a fit
    - `Lead` — qualified, in pipeline
    - `Sold` — closed on the call

#### n8n Workflows
1. **Scheduled Full Sync** (daily) — Pull all contacts with charges updated in last 24h, upsert to Supabase
2. **Webhook Real-Time Sync** — HubSpot webhook on contact property change (new charge), push to Supabase immediately
3. **SamCart Direct Sync** — SamCart webhook + daily schedule pulls purchase data directly into Supabase with richer detail (affiliate attribution, payment plan type, refund status, subscription changes). Deduplicates against HubSpot charge IDs to prevent double-counting. The existing SamCart→HubSpot workflow remains untouched for CRM purposes.
4. **Historical Backfill** (one-time) — Pull all historical charges to populate past months
5. **Meeting Sync** — HubSpot Meetings API webhook + daily schedule syncs scheduled meetings to Supabase, associated with the correct sales rep

#### Dashboard Changes
- Sales view auto-populated from HubSpot charges (read-only for synced data)
- Sales attribution view — shows each rep's attributed sales (auto from affiliates + manual)
- Manual attribution UI — assign a sale to a rep for non-affiliate purchases
- **Meetings view** — each rep sees their upcoming and past meetings with contact details
  - Reps can tag meeting outcomes (No Show, Rescheduled, Not Qualified, Lead, Sold)
  - Sales Manager sees all reps' meetings and outcomes
  - Lead quality metrics: no-show rate, qualification rate, close rate per rep and per funnel source
- "Last synced" timestamp visible
- Sync status indicator (healthy/stale/error)

**Outcome:** Sales tab shows real revenue data without manual entry, every sale is attributable to a rep, and lead quality is tracked from meeting to close.

---

### Phase 2: Student & Enrollment Sync

**Goal:** Automatically track student enrollments, cancellations, and status changes — with accurate classification of students vs. partners.

#### The Student vs. Partner Problem

When someone is added to the "Active Accelerator" segment in HubSpot, they could be either a **student** (paying member) or a **partner** (spouse/business partner of a student who gets access). Today both types inflate the student count, making it look like there are more students than there actually are.

#### Auto-Classification Logic

When a contact is added to the Active Accelerator segment, Mission Control classifies them automatically:

```
Contact added to "Active Accelerator" segment
  │
  ├─ Has Accelerator charge?  ──► YES ──► Student
  │
  ├─ Submitted partner form?  ──► YES ──► Partner (auto-link to student from form data)
  │
  └─ Neither?  ──► Flag for manual review (edge case / data issue)
```

- **Student:** Has a purchase/charge for an Accelerator product. This is the primary signal.
- **Partner:** Submitted the partner enrollment form in HubSpot. The form captures who the associated student is, allowing auto-linking.
- **Unclassified:** No charge and no partner form — rare edge case. Creates a review task for the team. These often indicate a data issue worth investigating.

This approach means ~95%+ of classifications are fully automated. The partner form is the key — it already exists and captures the relationship data needed.

#### Future Onboarding Automation

This classification trigger is also the foundation for automated onboarding workflows. Once a new student or partner is classified, n8n can:
- Populate onboarding task lists for the team
- Trigger welcome sequences
- Provision access to tools and platforms
- Notify the assigned coach

This is out of scope for the initial Phase 2 build but the classification trigger makes it easy to layer on later.

#### Accelerator Hub Integration (Future)

Once the Accelerator Hub app is ready, the enrollment classification trigger can automatically provision new student accounts:

```
Student classified in Mission Control
  │
  ├─ n8n workflow calls Accelerator Hub API → create student account
  ├─ Coach assignment (from Mission Control) → set up in Accelerator Hub
  └─ Student receives access credentials automatically
```

This eliminates manual account creation entirely. Mission Control becomes the source of truth for "who is a student," and Accelerator Hub consumes that signal to provision access. Partner accounts could follow the same pattern if partners need Hub access.

#### Data to Sync
- **Contact segment changes** — When a contact is added to a customer segment in HubSpot (segments are used instead of lifecycle stages to identify customers)
- **Charge-to-enrollment mapping** — New charge for a coaching product = new student enrollment
- **Partner form submissions** — HubSpot form submission = partner enrollment, linked to associated student
- **Subscription status** — Active, cancelled, paused (from HubSpot or SamCart webhook)
- **Coach assignment** — Custom HubSpot property or manual assignment in Mission Control
- **Program** — Derived from product in the charge

#### n8n Workflows
1. **New Enrollment Trigger** — Contact added to Active Accelerator segment → check for charge (student) or partner form (partner) → create record in Supabase with correct `member_type`
2. **Partner Auto-Linking** — When a partner is detected, look up the associated student from the partner form data and link them in Supabase
3. **Cancellation/Pause Trigger** — Subscription status change in HubSpot → log churn event, update student status
4. **Daily Reconciliation** — Compare HubSpot active subscriptions vs. Supabase student statuses, flag mismatches. Also flag any unclassified members.

#### Dashboard Changes
- Students auto-created when coaching product charges are detected
- Partners auto-created and linked to their student when partner form is detected
- **Unclassified queue** — shows contacts added to Active Accelerator with neither a charge nor a partner form, for manual review
- Student count displays **actual students** vs. **total members** (students + partners) so the numbers are always accurate
- Partner list viewable per student — "This student has 1 partner: [name]"
- Churn events auto-logged from subscription changes
- Manual fields remain for coach assignment, notes, attendance (these aren't in HubSpot)

**Outcome:** Student roster stays current without manual enrollment tracking, with accurate student vs. partner counts and automated classification.

---

### Phase 3: Funnel & Journey Tracking (The Big One)

**Goal:** Track the full journey from funnel opt-in to purchase, with speed and conversion metrics.

#### HubSpot Segment Naming Convention (Auto-Discovery)

Marketing creates HubSpot segments (lists) as they normally would, but uses a standardized prefix so Mission Control automatically detects and registers new entry points — no manual setup required.

| Prefix | Funnel Type | Example Segment Name |
|--------|-------------|----------------------|
| `LM:` | Lead Magnet | `LM: YouTube Secrets Guide` |
| `QZ:` | Quiz | `QZ: Creator Type Quiz` |
| `WC:` | Web Class | `WC: March 2026 Masterclass` |
| `FN:` | Funnel (general) | `FN: VRA Launch Funnel` |

**How it works:**
1. An n8n workflow runs daily and pulls all HubSpot lists
2. Filters for names matching a known prefix (`LM:`, `QZ:`, `WC:`, `FN:`)
3. Compares against existing funnel records in Supabase
4. Auto-creates any new funnels with the correct `funnel_type`, linked to the HubSpot list ID
5. Logs what was discovered so marketing can verify

**Historical segments (one-time setup):** Before auto-discovery begins, existing HubSpot segments need to be manually classified and imported into the `funnels` table. This is a one-time step during Phase 3 setup:
1. Pull all existing HubSpot lists/segments that represent entry points
2. Brian + marketing classify each one (lead magnet, quiz, web class, etc.)
3. Bulk-insert them into Supabase with the correct `hubspot_list_id` and `funnel_type`
4. These records are then available for the Historical Journey Backfill (workflow 9) to reconstruct past journeys

Existing segments do **not** need to be renamed — they live in Supabase already. The naming convention only applies to new segments going forward.

**Non-prefixed segments are ignored by auto-discovery** — this prevents internal or unrelated HubSpot lists from polluting Mission Control data.

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
| Call booked | Meeting link activity or custom property |
| Call completed | Meeting outcome or custom property |
| Purchase | New charge on contact (custom property) |
| Cancellation | Subscription status change or webhook |

#### n8n Workflows
1. **Form Submission Listener** — HubSpot webhook on form submit -> classify event type -> write journey event to Supabase
2. **Charge Change Listener** — Track new charges on contacts as purchase journey events
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

#### Daily Executive Slack Digest

Every morning (weekdays, or daily — configurable), the executive team receives a Slack message summarizing what happened yesterday. This is the "pulse check" that keeps leadership informed without logging into the dashboard.

**Daily digest includes:**

| Section | Metrics |
|---------|---------|
| **Sales** | New sales (count + revenue), sales by rep, total pipeline value |
| **Leads** | New leads entered the system, which funnel brought in the most |
| **Meetings** | Number of meetings held, outcomes breakdown (sold, no-show, not qualified, etc.) |
| **Students** | New Accelerator students, new Elite students, any cancellations/churn |
| **Funnels** | Top-performing funnel of the day, total opt-ins across all funnels |
| **Notable** | Any anomalies — unusually high/low day, milestones hit (e.g., "100th Accelerator student") |

**Example Slack message:**
```
📊 Mission Control — Tuesday, March 17

💰 Sales: 4 new sales ($8,200) — Sarah: 2, Mike: 1, James: 1
📥 Leads: 47 new leads — Top funnel: YouTube Secrets Guide (22)
📅 Meetings: 6 held — 3 Sold, 1 No Show, 2 Leads
🎓 Students: +2 Accelerator, +1 Elite, 0 cancellations
📈 Funnels: 89 total opt-ins across 5 active funnels

🔔 Milestone: Accelerator hit 150 active students!
```

**Implementation — Claude Scheduled Task (preferred over n8n):**

A Claude Code scheduled task runs daily (e.g., 7:00 AM) and:
1. Queries Supabase for yesterday's metrics across all modules
2. Compares against recent trends (last 7/30 days) to spot what's *unusual*, not just what happened
3. Writes an insightful summary — prioritizing what to lead with based on what's most important that day
4. Calls out anomalies with context (e.g., "Revenue was 40% below Tuesday average, but it was a holiday")
5. Posts to a designated Slack channel via webhook

**Why Claude over n8n for this:** An n8n workflow would produce a rigid, template-based message — fill in the blanks with numbers. Claude can analyze the data and tell leadership *what matters today*, adjust tone based on whether it was a big day or a quiet one, and surface insights that a template wouldn't catch. The digest should feel like a briefing from a smart analyst, not a report from a bot.

#### Additional Phase 4 Features

- **LTV Prediction** — Based on purchase history and engagement patterns, estimate customer lifetime value
- **Churn Risk Scoring** *(Claude task)* — Analyze student engagement patterns and flag at-risk students with reasoning, not just a score
- **Revenue Forecasting** — Project future MRR based on trends, seasonality, pipeline
- **Automated Alerts** *(Claude task)* — Intelligent alerting that evaluates whether an anomaly is actually worth paging someone about, with context and suggested actions
- **Weekly Executive Report** *(Claude task)* — Deeper weekly narrative with trends, week-over-week analysis, wins, risks, and recommended focus areas. Sent via email, complements the daily Slack digest.
- **CSV/PDF Export** — Download any view as CSV or formatted PDF

---

### Phase 5 (Future): External Integrations & AI-Assisted Sales

These are longer-term capabilities that build on the foundation of Phases 0–4. Not scoped or scheduled yet, but documented here so they inform architectural decisions in earlier phases.

#### Sales Call Intelligence (Zoom + AI)

Automatically enrich Mission Control meetings with call transcripts and AI analysis:

```
Sales rep completes Zoom meeting
  │
  ├─ Zoom webhook / API → pull recording transcript
  ├─ Transcript attached to the meeting record in Mission Control
  ├─ AI evaluation runs on transcript:
  │     ├─ Call quality score (based on a sales GPS / rubric)
  │     ├─ Key topics discussed
  │     ├─ Objections raised
  │     └─ Follow-up action items
  └─ AI-generated follow-up copy (email draft for the rep)
```

**Value:** Sales manager can review call quality across the team without listening to every call. Reps get instant follow-up drafts. Everything lives on the meeting record — outcome tag, transcript, score, and follow-up — in one place.

**Technical notes:**
- Zoom API provides meeting recordings and transcripts
- n8n handles the trigger (Zoom webhook → pull transcript → store in Supabase)
- Claude scheduled task handles the intelligence (evaluate transcript, score the call, generate follow-up copy, write analysis back to Supabase)
- Transcript + analysis stored in a `meeting_transcripts` table linked to `meetings`

#### Social & Content Analytics

Pull performance data from content platforms into Mission Control for a unified view of marketing reach and engagement:

| Platform | Data Available | Potential Use |
|----------|---------------|---------------|
| YouTube (YouTube Data API) | Views, subscribers, watch time, video performance, revenue | Track content ROI, correlate video topics with funnel opt-ins |
| Instagram (Meta Graph API) | Followers, reach, engagement, story/reel performance | Track brand growth, identify high-performing content formats |
| Meta Ads (Meta Marketing API) | Ad spend, impressions, clicks, conversions, ROAS | Track paid acquisition cost, tie ad campaigns to funnel entries |
| TikTok (TikTok API) | Views, followers, engagement | Track platform growth and content performance |
| Google Ads (Google Ads API) | Spend, clicks, conversions | Paid search attribution |

**Value:** Marketing Lead can see content performance alongside funnel data — "We posted X videos this month, they drove Y opt-ins, which converted to Z purchases." Closes the gap between content effort and revenue attribution.

**Technical notes:**
- Each platform integration would be its own n8n workflow on a daily sync
- Data stored in a `platform_metrics` table with platform, metric type, date, and value
- Dashboard would get a new "Content & Ads" view

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
  segment text,                  -- HubSpot segment (used instead of lifecycle stages)
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

-- Meetings (synced from HubSpot, outcomes tagged in Mission Control)
meetings (
  id uuid PRIMARY KEY,
  hubspot_meeting_id text UNIQUE NOT NULL,
  contact_id uuid REFERENCES contacts(id),
  rep_id uuid NOT NULL,              -- sales rep assigned to the meeting
  meeting_date timestamptz NOT NULL,
  meeting_type text,                 -- discovery, follow_up, close, etc.
  booking_source text,               -- which calendar link or funnel drove this booking
  outcome text,                      -- completed, no_show, rescheduled, not_qualified, lead, sold
  outcome_notes text,                -- optional rep notes
  outcome_tagged_at timestamptz,     -- when the rep tagged the outcome
  created_at timestamptz,
  updated_at timestamptz
)

-- Funnels (reference table — auto-populated via naming convention)
funnels (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  funnel_type text,          -- lead_magnet, quiz, webclass, funnel
  hubspot_list_id text,      -- HubSpot list/segment ID (auto-discovered)
  hubspot_form_id text,      -- HubSpot form ID (if applicable)
  discovered_at timestamptz, -- when auto-discovery first detected this segment
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

### New Table: Sales Attribution

```sql
-- Sales Attribution (maps purchases to reps)
sales_attribution (
  id uuid PRIMARY KEY,
  charge_id text NOT NULL,          -- reference to the charge record
  contact_id uuid REFERENCES contacts(id),
  rep_id uuid,                      -- sales rep
  attribution_source text NOT NULL, -- 'affiliate' (auto from SamCart) or 'manual'
  product text,
  amount numeric,
  charge_date timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
```

### Modified Tables (migrated from SQLite)
- `students` — add the following columns:
  - `hubspot_contact_id text` — links to HubSpot contact
  - `member_type text NOT NULL DEFAULT 'student'` — `student`, `partner`, or `unclassified`
  - `linked_student_id uuid REFERENCES students(id)` — if partner, which student they belong to
  - `classification_source text` — how they were classified: `charge_detected`, `partner_form`, `manual_review`
  - `classified_at timestamptz` — when classification happened
- `rep_sales` — add `synced_from_hubspot` boolean, `charge_ids` text array

---

## Automation Engine: n8n vs. Claude Scheduled Tasks

Not all automations are the same. The right tool depends on whether the job is **moving data** or **thinking about data**.

| Use n8n when... | Use Claude tasks when... |
|----------------|--------------------------|
| Syncing data between systems (HubSpot → Supabase) | The output is natural language (digests, reports, summaries) |
| Listening for webhooks (real-time triggers) | Analysis requires context, trends, or judgment |
| Simple transform-and-move operations | Anomaly detection that needs to decide "is this actually important?" |
| Non-engineers need to maintain the workflow | Generating content (follow-up emails, call evaluations) |
| The output is structured data | The task benefits from getting smarter over time |

**Hybrid pattern:** Some workflows use both. For example, sales call intelligence: n8n handles the trigger and data movement (Zoom webhook → pull transcript → store), then a Claude task handles the intelligence (evaluate, score, generate follow-up).

### Automation Assignment

| Task | Engine | Reasoning |
|------|--------|-----------|
| Data syncs (charges, contacts, meetings, enrollments) | n8n | Pure data movement, webhook-driven |
| Funnel auto-discovery | n8n | Pattern match on naming convention, upsert to DB |
| Daily reconciliation | n8n | Structured comparison, flag mismatches |
| Daily executive Slack digest | Claude | Needs trend analysis, prioritization, natural language |
| Weekly executive report | Claude | Narrative writing, week-over-week analysis |
| Churn risk scoring | Claude | Pattern recognition, contextual reasoning |
| Automated alerts | Claude | Needs to judge severity and provide context |
| Sales call evaluation | Claude | Transcript analysis, scoring, content generation |
| Follow-up email generation | Claude | Writing task requiring context from call + contact history |

---

## n8n Workflow Summary

| # | Workflow | Trigger | Frequency | Phase |
|---|----------|---------|-----------|-------|
| 1 | Charge Sync | HubSpot webhook + daily schedule | Real-time + daily | 1 |
| 2 | Historical Charge Backfill | Manual trigger | One-time | 1 |
| 3 | Contact Sync | HubSpot webhook + daily schedule | Real-time + daily | 1 |
| 3a | SamCart Direct Sync | SamCart webhook + daily schedule | Real-time + daily | 1 |
| 3b | SamCart Affiliate Attribution | Derived from SamCart direct sync | Real-time + daily | 1 |
| 3c | Meeting Sync | HubSpot Meetings API webhook + daily schedule | Real-time + daily | 1 |
| 4 | Enrollment Classification | Contact added to Active Accelerator segment | Real-time | 2 |
| 4a | Partner Auto-Linking | Partner form detected | Real-time | 2 |
| 5 | Subscription Status Sync | HubSpot/SamCart webhook | Real-time | 2 |
| 6 | Daily Student Reconciliation | Cron | Daily | 2 |
| 6a | Funnel Auto-Discovery | Cron (daily) | Daily | 3 |
| 7 | Form Submission Listener | HubSpot webhook | Real-time | 3 |
| 8 | Journey Event Logger | Multiple triggers | Real-time | 3 |
| 9 | Historical Journey Backfill | Manual trigger | One-time | 3 |
| 10 | Daily Metrics Aggregation | Cron | Daily | 3 |
| 11 | Alert & Report Generator | Cron + threshold triggers | Daily/weekly | 4 |

### Claude Scheduled Task Summary

| # | Task | Trigger | Frequency | Phase |
|---|------|---------|-----------|-------|
| C1 | Daily Executive Slack Digest | Cron (7:00 AM) | Daily (weekdays or daily) | 4 |
| C2 | Weekly Executive Report | Cron (Monday AM) | Weekly | 4 |
| C3 | Churn Risk Scoring | Cron | Daily | 4 |
| C4 | Intelligent Alerts | Cron + on-demand | Daily | 4 |
| C5 | Sales Call Evaluation | Triggered after n8n stores transcript | Per meeting | 5 |
| C6 | Follow-Up Email Generation | Triggered after C5 completes | Per meeting | 5 |

---

## Implementation Order & Dependencies

```
Phase 0: Foundation
  |-- Supabase setup, auth, deploy to Vercel
  |-- Migrate existing data
  |
Phase 1: Purchase & Sales Sync (depends on Phase 0)
  |-- HubSpot API connection via n8n
  |-- Charge sync workflows
  |-- SamCart affiliate sync for sales attribution
  |-- Manual attribution UI for non-affiliate sales
  |-- Sales view reads from Supabase instead of SQLite
  |
Phase 2: Student Sync (depends on Phase 1)
  |-- Enrollment auto-creation from coaching product charges
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

1. **HubSpot Charges Structure** — ✅ ANSWERED: Charges are a **custom object** in HubSpot (not a property on contacts). Each charge record contains: amount, contact email, associated contact, created date, and record ID. Charges are auto-created by the "[TMG] Charge form submitted" workflow. The product name and variant are embedded in the charge title string. A full audit of the HubSpot schema is still recommended before building the sync.
2. **SamCart Data Gap** — ✅ ANSWERED: HubSpot charge records capture the basics (product, amount, contact, date) but are missing: payment plan type, affiliate/rep attribution, subscription status, refund events, SamCart transaction ID, new vs. recurring flag, and structured discount data. A direct SamCart→n8n→Supabase sync is planned to fill these gaps (see Phase 1, workflow 3a).
3. **Historical Data Depth** — ✅ ANSWERED: All-time. Pull all available data from HubSpot, including data from older purchase services that fed into HubSpot.
4. **Funnel Inventory** — ⏳ PENDING: Brian will provide the complete list of active funnels, lead magnets, quizzes, and web class registration forms with their HubSpot form IDs.
5. **Coach Assignment** — ✅ ANSWERED: Coach assignments are tracked in Notion, not HubSpot. A separate Accelerator Hub app is being built for coaches to use with clients, which may serve as the future source for coach assignment data. For now, keep manual assignment in Mission Control.
6. **Web Class Attendance** — ✅ ANSWERED: Web class attendance is not currently tracked. Zoom is used for web classes (not RSVP). Tracking attendance via Zoom API integration could be a future enhancement.
7. **Access Scope** — ✅ ANSWERED: Executives can see all data. No view-level restrictions needed — full read access for all authenticated users.
8. **Existing Priority Bugs** — ⏳ PENDING: Brian needs to review the bugs and priorities in SALES_PRIORITIES.md and STUDENT-PRIORITIES.md before deciding on timing relative to the Supabase migration.
9. **Kajabi Direct Sync** — ⏳ PENDING: Evaluate whether Kajabi's API provides richer purchase data than what arrives in HubSpot charges (e.g., subscription status, payment plan details, refund events). If so, build a direct Kajabi→n8n→Supabase sync like SamCart. If HubSpot charges capture everything Kajabi offers, the existing Kajabi→HubSpot automation is sufficient.
10. **Partner Form ID** — ⏳ PENDING: Brian to provide the HubSpot form ID for the Accelerator partner enrollment form, needed for the auto-classification logic in Phase 2.

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
