-- ============================================================================
-- Mission Control v2 — Initial Supabase Schema
-- ============================================================================
-- Covers: Auth/RBAC, Contacts, Products, Charges, Students, Funnels,
--         Journey Events, Meetings, Sync Log, and v1 carry-forward tables.
-- Decision: Option D (hybrid) for charge title parsing.
-- All timestamps in UTC.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 0. Extensions
-- --------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- 1. RBAC — Users, Roles, Permissions
-- --------------------------------------------------------------------------
-- Roles define baseline access. Per-user overrides expand or restrict.

create type user_role as enum (
  'admin',
  'executive',
  'sales_manager',
  'sales_rep',
  'marketing_lead',
  'coaching_director',
  'program_manager',
  'custom_viewer'
);

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text not null default '',
  role          user_role not null default 'custom_viewer',
  -- Program-scoped roles: which program(s) this user manages
  -- null = all programs (admin/executive), otherwise 'accelerator', 'elite', etc.
  program_scope text[] default null,
  avatar_url    text default '',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Views a user can access (additive model)
create table user_view_access (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  view_name   text not null,  -- 'sales', 'students', 'marketing', 'journeys', 'meetings', etc.
  can_write   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique(user_id, view_name)
);

-- --------------------------------------------------------------------------
-- 2. Products — Canonical product catalogue (Option D: mapping table)
-- --------------------------------------------------------------------------
-- Used to normalize charge titles and SamCart product names to canonical records.

create table products (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,         -- e.g. 'Think Media Accelerator'
  short_name      text not null default '',      -- e.g. 'Accelerator'
  product_type    text not null default 'other', -- 'coaching', 'course', 'event', 'membership', 'other'
  program         text default null,             -- 'accelerator', 'elite', null
  default_price   numeric(10,2) default null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Mapping table: known title substrings/patterns → canonical product
-- n8n sync uses this to normalize HubSpot charge titles
create table product_title_mappings (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id) on delete cascade,
  title_pattern   text not null,          -- substring or regex to match against charge title
  match_type      text not null default 'contains', -- 'contains', 'starts_with', 'regex'
  priority        int not null default 0, -- higher = checked first (for overlapping patterns)
  created_at      timestamptz not null default now(),
  unique(title_pattern, match_type)
);

-- --------------------------------------------------------------------------
-- 3. Contacts — HubSpot contacts
-- --------------------------------------------------------------------------

create table contacts (
  id                  uuid primary key default gen_random_uuid(),
  hubspot_contact_id  text unique not null,
  email               text not null default '',
  first_name          text not null default '',
  last_name           text not null default '',
  full_name           text generated always as (
    case
      when first_name = '' and last_name = '' then email
      when last_name = '' then first_name
      else first_name || ' ' || last_name
    end
  ) stored,
  phone               text default '',
  first_conversion_date timestamptz default null,
  recent_conversion_date timestamptz default null,
  hubspot_owner_id    text default null,
  lifecycle_stage     text default '',
  metadata            jsonb default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_contacts_email on contacts(email);
create index idx_contacts_hubspot_id on contacts(hubspot_contact_id);

-- Junction table: contacts ↔ segments (many-to-many)
create table contact_segments (
  id              uuid primary key default gen_random_uuid(),
  contact_id      uuid not null references contacts(id) on delete cascade,
  segment_name    text not null,
  hubspot_list_id text default null,
  added_at        timestamptz not null default now(),
  unique(contact_id, segment_name)
);

create index idx_contact_segments_contact on contact_segments(contact_id);
create index idx_contact_segments_segment on contact_segments(segment_name);

-- --------------------------------------------------------------------------
-- 4. Charges — Purchase records (HubSpot charges + SamCart enrichment)
-- --------------------------------------------------------------------------

create table charges (
  id                    uuid primary key default gen_random_uuid(),
  contact_id            uuid not null references contacts(id) on delete cascade,
  hubspot_charge_id     text unique default null,
  samcart_transaction_id text unique default null,
  -- Product info
  product_id            uuid references products(id) on delete set null,
  raw_title             text not null default '',    -- original HubSpot charge title
  product_variant       text default '',
  amount                numeric(10,2) not null default 0,
  currency              text not null default 'USD',
  -- Source tracking
  source_platform       text not null default 'hubspot', -- 'samcart', 'kajabi', 'hubspot'
  is_new_purchase       boolean default null,     -- first purchase vs recurring
  -- SamCart-enriched fields (null until SamCart sync provides them)
  payment_plan_type     text default null,        -- 'one_time', 'installment', 'subscription'
  affiliate_id          text default null,        -- SamCart affiliate (sales rep attribution)
  affiliate_name        text default null,
  subscription_status   text default null,        -- 'active', 'cancelled', 'paused', 'failed'
  refund_amount         numeric(10,2) default null,
  refund_date           timestamptz default null,
  -- Dedup / enrichment tracking
  pending_samcart_enrichment boolean not null default false,
  -- Timestamps
  charge_date           timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_charges_contact on charges(contact_id);
create index idx_charges_product on charges(product_id);
create index idx_charges_date on charges(charge_date);
create index idx_charges_samcart_tx on charges(samcart_transaction_id);
create index idx_charges_affiliate on charges(affiliate_id);

-- --------------------------------------------------------------------------
-- 5. Sales Reps & Attribution
-- --------------------------------------------------------------------------

create table sales_reps (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  email           text unique default null,
  user_id         uuid references profiles(id) on delete set null, -- linked to auth profile
  samcart_affiliate_id text default null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Manual attribution for non-affiliate purchases
create table charge_attributions (
  id              uuid primary key default gen_random_uuid(),
  charge_id       uuid not null references charges(id) on delete cascade,
  sales_rep_id    uuid not null references sales_reps(id) on delete cascade,
  attribution_type text not null default 'manual', -- 'affiliate', 'manual'
  attributed_by   uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique(charge_id)
);

-- --------------------------------------------------------------------------
-- 6. Meetings — HubSpot meetings with outcome tagging
-- --------------------------------------------------------------------------

create type meeting_outcome as enum (
  'pending',
  'completed',
  'no_show',
  'rescheduled',
  'not_qualified',
  'lead',
  'sold'
);

create table meetings (
  id                  uuid primary key default gen_random_uuid(),
  hubspot_meeting_id  text unique default null,
  sales_rep_id        uuid references sales_reps(id) on delete set null,
  contact_id          uuid references contacts(id) on delete set null,
  title               text not null default '',
  meeting_date        timestamptz not null,
  duration_minutes    int default null,
  booking_source      text default '',    -- which calendar link / funnel booked the meeting
  outcome             meeting_outcome not null default 'pending',
  outcome_notes       text default '',
  outcome_tagged_by   uuid references profiles(id) on delete set null,
  outcome_tagged_at   timestamptz default null,
  metadata            jsonb default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_meetings_rep on meetings(sales_rep_id);
create index idx_meetings_contact on meetings(contact_id);
create index idx_meetings_date on meetings(meeting_date);

-- --------------------------------------------------------------------------
-- 7. Students & Enrollments (v2 — auto-classified)
-- --------------------------------------------------------------------------

create type member_type as enum ('student', 'partner', 'unclassified');
create type student_status as enum ('active', 'cancelled', 'paused', 'downgraded');

create table students (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          uuid references contacts(id) on delete set null,
  -- v1 carry-forward fields
  name                text not null,
  email               text not null default '',
  youtube_channel     text default '',
  coach               text default '',
  program             text not null default 'accelerator', -- 'accelerator', 'elite'
  monthly_revenue     numeric(10,2) not null default 0,
  signup_date         date not null default current_date,
  status              student_status not null default 'active',
  payment_plan        text default '',
  renewal_date        text default '',
  notes               text default '',
  switch_requested_to text default '',
  switch_requested_date text default '',
  -- v2 new fields
  member_type         member_type not null default 'student',
  linked_student_id   uuid references students(id) on delete set null, -- for partners
  hubspot_segment     text default '',      -- which segment triggered classification
  classification_source text default 'manual', -- 'auto_charge', 'auto_partner_form', 'manual'
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_students_contact on students(contact_id);
create index idx_students_program on students(program);
create index idx_students_status on students(status);
create index idx_students_member_type on students(member_type);

create table churn_events (
  id                      uuid primary key default gen_random_uuid(),
  student_id              uuid not null references students(id) on delete cascade,
  event_type              text not null,  -- 'cancel', 'downgrade', 'pause', 'restart'
  event_date              date not null,
  reason                  text default '',
  monthly_revenue_impact  numeric(10,2) not null default 0,
  coach                   text default '',
  notes                   text default '',
  source                  text default 'manual', -- 'manual', 'samcart_webhook', 'hubspot_sync'
  created_at              timestamptz not null default now()
);

create index idx_churn_student on churn_events(student_id);
create index idx_churn_date on churn_events(event_date);

-- Coach capacity
create table coach_capacity (
  id              uuid primary key default gen_random_uuid(),
  coach_name      text not null unique,
  max_students    int not null default 20,
  preferred_max   int not null default 17,
  status          text not null default 'active', -- 'active', 'limited', 'inactive'
  notes           text default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Elite sessions + attendance
create table elite_sessions (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  session_type    text not null default 'workshop', -- 'workshop', 'mastermind'
  session_date    date not null,
  facilitator     text default 'Sean',
  notes           text default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table elite_attendance (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references elite_sessions(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  attended    boolean not null default true,
  notes       text default '',
  created_at  timestamptz not null default now(),
  unique(session_id, student_id)
);

-- --------------------------------------------------------------------------
-- 8. Funnels & Journey Events (Phase 3, schema created now)
-- --------------------------------------------------------------------------

create table funnels (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  funnel_type     text not null default 'general', -- 'lead_magnet', 'quiz', 'web_class', 'funnel'
  hubspot_list_id text unique default null,
  is_active       boolean not null default true,
  discovered_at   timestamptz default null,    -- when auto-discovery found it
  metadata        jsonb default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table journey_events (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts(id) on delete cascade,
  event_type  text not null,  -- 'opt_in', 'webclass_registered', 'webclass_attended', 'quiz_completed',
                               -- 'call_booked', 'call_completed', 'purchase', 'refund', 'cancel',
                               -- 'pause', 'restart', 'upsell', 'payment_failed', 'subscription_paused'
  event_date  timestamptz not null default now(),
  funnel_id   uuid references funnels(id) on delete set null,
  product_id  uuid references products(id) on delete set null,
  charge_id   uuid references charges(id) on delete set null,
  amount      numeric(10,2) default null,
  source      text default '',    -- human-readable source label
  metadata    jsonb default '{}', -- UTM params, quiz answers, etc.
  created_at  timestamptz not null default now()
);

create index idx_journey_contact on journey_events(contact_id);
create index idx_journey_type on journey_events(event_type);
create index idx_journey_date on journey_events(event_date);
create index idx_journey_funnel on journey_events(funnel_id);

-- --------------------------------------------------------------------------
-- 9. Sync Log — Admin sync health panel
-- --------------------------------------------------------------------------

create table sync_log (
  id              uuid primary key default gen_random_uuid(),
  workflow_name   text not null,          -- 'hubspot_charge_sync', 'samcart_sync', 'meeting_sync', etc.
  status          text not null default 'success', -- 'success', 'error', 'partial'
  records_processed int not null default 0,
  records_created   int not null default 0,
  records_updated   int not null default 0,
  records_skipped   int not null default 0,
  error_message     text default null,
  error_details     jsonb default null,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz default null,
  triggered_by      text default 'schedule', -- 'schedule', 'webhook', 'manual'
  created_at        timestamptz not null default now()
);

create index idx_sync_log_workflow on sync_log(workflow_name);
create index idx_sync_log_status on sync_log(status);
create index idx_sync_log_started on sync_log(started_at desc);

-- --------------------------------------------------------------------------
-- 10. Revenue snapshots & budget targets (v1 carry-forward)
-- --------------------------------------------------------------------------

create table revenue_snapshots (
  id            uuid primary key default gen_random_uuid(),
  product_name  text not null,
  month         text not null,  -- YYYY-MM
  amount        numeric(10,2) not null default 0,
  notes         text default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(product_name, month)
);

create table budget_targets (
  id              uuid primary key default gen_random_uuid(),
  month           text not null unique,  -- YYYY-MM
  target_income   numeric(10,2) not null default 0,
  target_expense  numeric(10,2) not null default 0,
  notes           text default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- 11. Rep quotas (v1 carry-forward — will be auto-populated in v2)
-- --------------------------------------------------------------------------

create table rep_quotas (
  id              uuid primary key default gen_random_uuid(),
  rep_name        text not null,
  month           text not null,  -- YYYY-MM
  target_amount   numeric(10,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(rep_name, month)
);

-- --------------------------------------------------------------------------
-- 12. Updated_at trigger function
-- --------------------------------------------------------------------------

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply to all tables with updated_at
create trigger trg_profiles_updated_at before update on profiles for each row execute function update_updated_at();
create trigger trg_products_updated_at before update on products for each row execute function update_updated_at();
create trigger trg_contacts_updated_at before update on contacts for each row execute function update_updated_at();
create trigger trg_charges_updated_at before update on charges for each row execute function update_updated_at();
create trigger trg_sales_reps_updated_at before update on sales_reps for each row execute function update_updated_at();
create trigger trg_meetings_updated_at before update on meetings for each row execute function update_updated_at();
create trigger trg_students_updated_at before update on students for each row execute function update_updated_at();
create trigger trg_coach_capacity_updated_at before update on coach_capacity for each row execute function update_updated_at();
create trigger trg_elite_sessions_updated_at before update on elite_sessions for each row execute function update_updated_at();
create trigger trg_funnels_updated_at before update on funnels for each row execute function update_updated_at();
create trigger trg_revenue_snapshots_updated_at before update on revenue_snapshots for each row execute function update_updated_at();
create trigger trg_budget_targets_updated_at before update on budget_targets for each row execute function update_updated_at();
create trigger trg_rep_quotas_updated_at before update on rep_quotas for each row execute function update_updated_at();

-- --------------------------------------------------------------------------
-- 13. Row Level Security (RLS)
-- --------------------------------------------------------------------------
-- Strategy: All tables have RLS enabled. Policies use the user's role
-- from the profiles table. Service role (n8n sync) bypasses RLS.

-- Helper function: get current user's role
create or replace function get_user_role()
returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable;

-- Helper function: get current user's program scope
create or replace function get_user_program_scope()
returns text[] as $$
  select program_scope from profiles where id = auth.uid();
$$ language sql security definer stable;

-- Helper function: check if user has access to a view
create or replace function has_view_access(view_name_param text)
returns boolean as $$
  select exists(
    select 1 from user_view_access
    where user_id = auth.uid() and view_name = view_name_param
  )
  or get_user_role() in ('admin', 'executive');
$$ language sql security definer stable;

-- Helper: check if user has write access to a view
create or replace function has_view_write_access(view_name_param text)
returns boolean as $$
  select exists(
    select 1 from user_view_access
    where user_id = auth.uid() and view_name = view_name_param and can_write = true
  )
  or get_user_role() = 'admin';
$$ language sql security definer stable;

-- ---- Enable RLS on all tables ----
alter table profiles enable row level security;
alter table user_view_access enable row level security;
alter table products enable row level security;
alter table product_title_mappings enable row level security;
alter table contacts enable row level security;
alter table contact_segments enable row level security;
alter table charges enable row level security;
alter table sales_reps enable row level security;
alter table charge_attributions enable row level security;
alter table meetings enable row level security;
alter table students enable row level security;
alter table churn_events enable row level security;
alter table coach_capacity enable row level security;
alter table elite_sessions enable row level security;
alter table elite_attendance enable row level security;
alter table funnels enable row level security;
alter table journey_events enable row level security;
alter table sync_log enable row level security;
alter table revenue_snapshots enable row level security;
alter table budget_targets enable row level security;
alter table rep_quotas enable row level security;

-- ---- Profiles ----
-- Users can read their own profile; admin/executive can read all
create policy profiles_select on profiles for select using (
  id = auth.uid() or get_user_role() in ('admin', 'executive')
);
-- Users can update their own profile; admin can update any
create policy profiles_update on profiles for update using (
  id = auth.uid() or get_user_role() = 'admin'
);
-- Only admin can insert/delete profiles
create policy profiles_insert on profiles for insert with check (get_user_role() = 'admin');
create policy profiles_delete on profiles for delete using (get_user_role() = 'admin');

-- ---- User View Access ----
create policy uva_select on user_view_access for select using (
  user_id = auth.uid() or get_user_role() = 'admin'
);
create policy uva_admin on user_view_access for all using (get_user_role() = 'admin');

-- ---- Products (read-all for authenticated, write for admin) ----
create policy products_select on products for select using (auth.uid() is not null);
create policy products_write on products for all using (get_user_role() = 'admin');

-- ---- Product Title Mappings ----
create policy ptm_select on product_title_mappings for select using (auth.uid() is not null);
create policy ptm_write on product_title_mappings for all using (get_user_role() = 'admin');

-- ---- Contacts (view-based access) ----
create policy contacts_select on contacts for select using (auth.uid() is not null);
create policy contacts_write on contacts for all using (get_user_role() = 'admin');

-- ---- Contact Segments ----
create policy cs_select on contact_segments for select using (auth.uid() is not null);
create policy cs_write on contact_segments for all using (get_user_role() = 'admin');

-- ---- Charges ----
create policy charges_select on charges for select using (
  has_view_access('sales')
);
create policy charges_write on charges for all using (get_user_role() = 'admin');

-- ---- Sales Reps ----
create policy reps_select on sales_reps for select using (auth.uid() is not null);
create policy reps_write on sales_reps for all using (get_user_role() = 'admin');

-- ---- Charge Attributions ----
create policy attr_select on charge_attributions for select using (has_view_access('sales'));
create policy attr_insert on charge_attributions for insert with check (
  has_view_write_access('sales')
);

-- ---- Meetings ----
-- Sales reps can see their own meetings; managers/admin/exec see all
create policy meetings_select on meetings for select using (
  has_view_access('meetings')
  or sales_rep_id = (select id from sales_reps where user_id = auth.uid() limit 1)
);
-- Sales reps can update outcome on their own meetings
create policy meetings_update on meetings for update using (
  get_user_role() = 'admin'
  or sales_rep_id = (select id from sales_reps where user_id = auth.uid() limit 1)
);
create policy meetings_write on meetings for insert with check (get_user_role() = 'admin');

-- ---- Students ----
create policy students_select on students for select using (
  has_view_access('students')
);
-- Program managers can only see their program's students
-- (enforced at query level via program_scope, not RLS — keeps policies simpler)
create policy students_write on students for all using (
  has_view_write_access('students') or get_user_role() = 'admin'
);

-- ---- Churn Events ----
create policy churn_select on churn_events for select using (has_view_access('students'));
create policy churn_write on churn_events for all using (
  has_view_write_access('students') or get_user_role() = 'admin'
);

-- ---- Coach Capacity ----
create policy cc_select on coach_capacity for select using (has_view_access('students'));
create policy cc_write on coach_capacity for all using (get_user_role() = 'admin');

-- ---- Elite Sessions + Attendance ----
create policy es_select on elite_sessions for select using (has_view_access('students'));
create policy es_write on elite_sessions for all using (
  has_view_write_access('students') or get_user_role() = 'admin'
);
create policy ea_select on elite_attendance for select using (has_view_access('students'));
create policy ea_write on elite_attendance for all using (
  has_view_write_access('students') or get_user_role() = 'admin'
);

-- ---- Funnels ----
create policy funnels_select on funnels for select using (auth.uid() is not null);
create policy funnels_write on funnels for all using (get_user_role() = 'admin');

-- ---- Journey Events ----
create policy je_select on journey_events for select using (
  has_view_access('journeys') or has_view_access('marketing')
);
create policy je_write on journey_events for all using (get_user_role() = 'admin');

-- ---- Sync Log (admin only) ----
create policy sl_select on sync_log for select using (get_user_role() = 'admin');
create policy sl_write on sync_log for all using (get_user_role() = 'admin');

-- ---- Revenue Snapshots ----
create policy rs_select on revenue_snapshots for select using (has_view_access('sales'));
create policy rs_write on revenue_snapshots for all using (get_user_role() = 'admin');

-- ---- Budget Targets ----
create policy bt_select on budget_targets for select using (
  get_user_role() in ('admin', 'executive')
);
create policy bt_write on budget_targets for all using (get_user_role() = 'admin');

-- ---- Rep Quotas ----
create policy rq_select on rep_quotas for select using (has_view_access('sales'));
create policy rq_write on rep_quotas for all using (get_user_role() = 'admin');
