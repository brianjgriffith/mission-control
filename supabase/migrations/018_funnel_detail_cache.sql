-- ============================================================================
-- Extended funnel performance cache with product breakdowns + speed data
-- ============================================================================

alter table funnel_performance
  add column if not exists products_after jsonb default '[]',
  add column if not exists products_before jsonb default '[]',
  add column if not exists speed_distribution jsonb default '{}',
  add column if not exists median_days_to_purchase int default null;
