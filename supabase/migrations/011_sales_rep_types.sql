-- Add rep_type to distinguish sales team from coaches
alter table sales_reps add column if not exists rep_type text not null default 'sales';

-- Update the get_rep_sales_from_charges RPC to accept a rep_type filter
create or replace function get_rep_sales_from_charges(
  filter_month text default null,
  filter_rep_type text default null
)
returns json as $$
declare
  result json;
begin
  with attributed_charges as (
    select
      sr.name as rep_name,
      sr.rep_type,
      to_char(c.charge_date, 'YYYY-MM') as month,
      coalesce(p.group_name, p.short_name, 'Other') as product,
      c.amount,
      c.payment_plan_type,
      c.refund_amount as charge_refund,
      ca.attribution_type
    from charge_attributions ca
    join sales_reps sr on ca.sales_rep_id = sr.id
    join charges c on ca.charge_id = c.id
    left join products p on c.product_id = p.id
    where (filter_month is null or to_char(c.charge_date, 'YYYY-MM') = filter_month)
      and (filter_rep_type is null or sr.rep_type = filter_rep_type)
  ),
  aggregated as (
    select
      rep_name,
      month,
      product,
      count(*) as deal_count,
      coalesce(sum(amount), 0) as amount,
      coalesce(sum(case when payment_plan_type != 'subscription' or payment_plan_type is null then amount else 0 end), 0) as new_amount,
      coalesce(sum(case when payment_plan_type = 'subscription' then amount else 0 end), 0) as recurring_amount,
      coalesce(sum(charge_refund), 0) as refund_amount
    from attributed_charges
    group by rep_name, month, product
    order by month, rep_name, product
  )
  select coalesce(
    json_agg(json_build_object(
      'id', rep_name || '-' || month || '-' || product,
      'rep_name', rep_name,
      'month', month,
      'product', product,
      'amount', amount,
      'new_amount', new_amount,
      'recurring_amount', recurring_amount,
      'deal_count', deal_count,
      'booked_calls', 0,
      'refund_amount', refund_amount,
      'notes', '',
      'created_at', now(),
      'updated_at', now()
    )),
    '[]'::json
  ) into result
  from aggregated;

  return result;
end;
$$ language plpgsql stable;

-- Also update the assign RPC to match affiliate_id directly (not just name)
create or replace function assign_product_to_charges(
  pattern text,
  target_product_id uuid,
  mapping_priority int default 50
)
returns json as $$
declare
  updated_count int;
  mapping_id uuid;
begin
  update charges
  set product_id = target_product_id,
      updated_at = now()
  where product_id is null
    and (product_variant ilike '%' || pattern || '%'
         or raw_title ilike '%' || pattern || '%');

  get diagnostics updated_count = row_count;

  insert into product_title_mappings (product_id, title_pattern, match_type, priority)
  values (target_product_id, pattern, 'contains', mapping_priority)
  on conflict (title_pattern, match_type) do nothing
  returning id into mapping_id;

  return json_build_object(
    'charges_updated', updated_count,
    'mapping_created', mapping_id is not null
  );
end;
$$ language plpgsql;
