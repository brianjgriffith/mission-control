-- ============================================================================
-- Cached funnel performance data
-- ============================================================================
-- Pre-computed by a script, read by the Journeys view.
-- Avoids pulling from HubSpot on every page load.
-- ============================================================================

create table funnel_performance (
  id                  uuid primary key default gen_random_uuid(),
  funnel_id           uuid not null references funnels(id) on delete cascade,
  total_optins        int not null default 0,
  purchased_after     int not null default 0,
  purchased_before    int not null default 0,
  never_purchased     int not null default 0,
  conversion_rate     numeric(5,1) not null default 0,
  revenue_after       numeric(12,2) not null default 0,
  avg_days_to_purchase int default null,
  -- "First product" tracking for PRODUCT-type funnels
  first_time_buyers   int not null default 0,  -- people whose first-ever purchase was this product
  repeat_buyers       int not null default 0,  -- people who had bought before and bought again
  computed_at         timestamptz not null default now(),
  unique(funnel_id)
);

alter table funnel_performance enable row level security;
create policy fp_select on funnel_performance for select using (auth.uid() is not null);
create policy fp_write on funnel_performance for all using (true);
