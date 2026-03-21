-- ============================================================================
-- Product Groups — roll up product variants into families
-- ============================================================================

alter table products add column group_name text default null;

-- VRA family (Video Ranking Academy) — all course & membership variants
update products set group_name = 'Video Ranking Academy' where name in (
  'Video Ranking Academy',
  'VRA Membership - Monthly',
  'VRA Membership - Annual',
  'VRA Base Lifetime',
  'VRA Bundle',
  'VRA Accelerator Setup',
  'YouTube Course & Coaching Bundle',
  'Video Ranking Academy Course & Coaching Bundle',
  'Video Ranking Academy Course & Coaching Membership'
);

-- Accelerator
update products set group_name = 'Accelerator' where name = 'Think Media Accelerator';

-- Elite
update products set group_name = 'VRA Elite' where name = 'VRA Elite';

-- YouTube Courses (non-VRA standalone products)
update products set group_name = 'YouTube Courses' where name in (
  'YouTube Secrets',
  'YouTube Starter Kit',
  'YouTube Money Secrets'
);

-- Events & Challenges
update products set group_name = 'Events & Challenges' where name in (
  'YouTube 1K Challenge',
  'YouTube Growth Day',
  'Holiday Bundle',
  'YouTube Growth Bundle'
);

-- Legacy
update products set group_name = 'Legacy' where name in (
  'Legacy Inner Circle Membership',
  'Video Success Secrets',
  'Camera Confidence Course',
  'Create Awesome Thumbnails',
  'Steal Our YouTube Playbook',
  'How to Make Awesome Videos',
  'Video Editing Basics'
);

-- Update the charge stats RPC to support group_name
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
    select c.amount, c.product_id, c.source_platform, p.group_name
    from charges c
    left join products p on c.product_id = p.id
    where
      (filter_month is null or to_char(c.charge_date, 'YYYY-MM') = filter_month)
      and (filter_product_id is null or c.product_id = filter_product_id)
      and (filter_source_platform is null or c.source_platform = filter_source_platform)
  ),
  totals as (
    select
      coalesce(sum(amount), 0) as total_revenue,
      count(*) as total_charges
    from filtered
  ),
  by_group as (
    select
      coalesce(group_name, 'Unmatched') as key,
      sum(amount) as value
    from filtered
    group by group_name
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
    'by_group', coalesce((select json_object_agg(key, value) from by_group), '{}'::json),
    'by_product', coalesce((select json_object_agg(key, value) from by_product), '{}'::json),
    'by_platform', coalesce((select json_object_agg(key, value) from by_platform), '{}'::json)
  ) into result;

  return result;
end;
$$ language plpgsql stable;

-- Update monthly stats to use group_name
create or replace function get_monthly_charge_stats(
  start_date timestamptz,
  filter_product_id uuid default null
)
returns json as $$
declare
  result json;
begin
  with filtered as (
    select c.amount, c.charge_date, c.product_id, coalesce(p.group_name, 'Unmatched') as group_name
    from charges c
    left join products p on c.product_id = p.id
    where c.charge_date >= start_date
      and (filter_product_id is null or c.product_id = filter_product_id)
  ),
  monthly as (
    select
      to_char(charge_date, 'YYYY-MM') as month,
      sum(amount) as total,
      count(*) as count,
      group_name
    from filtered
    group by to_char(charge_date, 'YYYY-MM'), group_name
  ),
  month_totals as (
    select
      month,
      sum(total) as total,
      sum(count) as count,
      json_object_agg(group_name, total) as by_group
    from monthly
    group by month
    order by month
  )
  select coalesce(
    json_agg(json_build_object(
      'month', month,
      'total', total,
      'count', count,
      'by_group', by_group
    ) order by month),
    '[]'::json
  ) into result
  from month_totals;

  return result;
end;
$$ language plpgsql stable;
