-- ============================================================================
-- Mission Control v2 — v1 Carry-Forward Tables
-- ============================================================================
-- These tables hold manually-entered v1 data that will eventually be replaced
-- by automated sync (Phase 1+). They're needed now so the existing dashboard
-- views work on Vercel.
-- ============================================================================

-- Rep sales — manual monthly sales tracking per rep (replaced by charges in Phase 1)
create table rep_sales (
  id                uuid primary key default gen_random_uuid(),
  rep_name          text not null,
  month             text not null,  -- YYYY-MM
  product           text not null default 'accelerator',
  amount            numeric(10,2) not null default 0,
  new_amount        numeric(10,2) not null default 0,
  recurring_amount  numeric(10,2) not null default 0,
  refund_amount     numeric(10,2) not null default 0,
  deal_count        int not null default 0,
  booked_calls      int not null default 0,
  notes             text default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(rep_name, month, product)
);

create trigger trg_rep_sales_updated_at before update on rep_sales
  for each row execute function update_updated_at();

alter table rep_sales enable row level security;
create policy rs2_select on rep_sales for select using (auth.uid() is not null);
create policy rs2_write on rep_sales for all using (
  get_user_role() in ('admin', 'executive', 'sales_manager')
);

-- Calendar events
create table calendar_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text default '',
  start_date  date not null,
  end_date    date default null,
  event_type  text not null default 'custom',
  color       text default '',
  all_day     boolean not null default true,
  project_id  text default null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_calendar_events_updated_at before update on calendar_events
  for each row execute function update_updated_at();

alter table calendar_events enable row level security;
create policy ce_select on calendar_events for select using (auth.uid() is not null);
create policy ce_write on calendar_events for all using (get_user_role() = 'admin');
