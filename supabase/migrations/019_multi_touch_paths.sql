-- ============================================================================
-- Multi-touch attribution paths
-- ============================================================================
-- Stores aggregated path analysis per funnel: how many funnels people
-- went through before purchasing, common paths, attribution splits.
-- ============================================================================

-- Add path data to funnel_performance cache
alter table funnel_performance
  add column if not exists avg_funnels_before_purchase numeric(4,1) default null,
  add column if not exists common_paths jsonb default '[]',
  add column if not exists touch_distribution jsonb default '{}';

-- Separate table for individual contact journey paths (for the detail view)
create table if not exists contact_funnel_paths (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references contacts(id) on delete cascade,
  email             text not null,
  funnels_touched   jsonb not null default '[]',  -- [{funnel_id, funnel_name, added_at}]
  total_funnels     int not null default 0,
  first_funnel_date timestamptz default null,
  first_purchase_date timestamptz default null,
  days_to_purchase  int default null,
  first_purchase_amount numeric(10,2) default null,
  first_purchase_product text default null,
  computed_at       timestamptz not null default now(),
  unique(contact_id)
);

alter table contact_funnel_paths enable row level security;
create policy cfp_select on contact_funnel_paths for select using (auth.uid() is not null);
create policy cfp_write on contact_funnel_paths for all using (true);

create index if not exists idx_cfp_total_funnels on contact_funnel_paths(total_funnels);
