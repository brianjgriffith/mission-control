-- ============================================================================
-- Charge stats aggregate function
-- ============================================================================
-- Computes total revenue, charge count, and breakdowns by product/platform
-- server-side to avoid Supabase's 1000-row default limit.
-- ============================================================================

create or replace function get_charge_stats(
  filter_month text default null,
  filter_product_id uuid default null,
  filter_source_platform text default null
)
returns json as $$
declare
  result json;
begin
  with filtered as (
    select amount, product_id, source_platform
    from charges
    where
      (filter_month is null or to_char(charge_date, 'YYYY-MM') = filter_month)
      and (filter_product_id is null or product_id = filter_product_id)
      and (filter_source_platform is null or source_platform = filter_source_platform)
  ),
  totals as (
    select
      coalesce(sum(amount), 0) as total_revenue,
      count(*) as total_charges
    from filtered
  ),
  by_product as (
    select
      coalesce(product_id::text, 'unmatched') as key,
      sum(amount) as value
    from filtered
    group by product_id
  ),
  by_platform as (
    select
      coalesce(source_platform, 'unknown') as key,
      sum(amount) as value
    from filtered
    group by source_platform
  )
  select json_build_object(
    'total_revenue', (select total_revenue from totals),
    'total_charges', (select total_charges from totals),
    'by_product', coalesce((select json_object_agg(key, value) from by_product), '{}'::json),
    'by_platform', coalesce((select json_object_agg(key, value) from by_platform), '{}'::json)
  ) into result;

  return result;
end;
$$ language plpgsql stable;

-- ============================================================================
-- Monthly charge aggregation function for charts
-- ============================================================================

create or replace function get_monthly_charge_stats(
  start_date timestamptz,
  filter_product_id uuid default null
)
returns json as $$
declare
  result json;
begin
  with filtered as (
    select amount, charge_date, product_id
    from charges
    where charge_date >= start_date
      and (filter_product_id is null or product_id = filter_product_id)
  ),
  monthly as (
    select
      to_char(charge_date, 'YYYY-MM') as month,
      sum(amount) as total,
      count(*) as count,
      product_id
    from filtered
    group by to_char(charge_date, 'YYYY-MM'), product_id
  ),
  month_totals as (
    select
      month,
      sum(total) as total,
      sum(count) as count,
      json_object_agg(
        coalesce(product_id::text, 'unmatched'),
        total
      ) as by_product
    from monthly
    group by month
    order by month
  )
  select coalesce(
    json_agg(json_build_object(
      'month', month,
      'total', total,
      'count', count,
      'by_product', by_product
    ) order by month),
    '[]'::json
  ) into result
  from month_totals;

  return result;
end;
$$ language plpgsql stable;
