-- ============================================================================
-- Compute sales rep performance from charges + attributions
-- ============================================================================
-- Returns data in the same shape as the old rep_sales table so the
-- existing Sales view works without changes.
-- Aggregates charges by: sales rep → month → product group
-- ============================================================================

create or replace function get_rep_sales_from_charges(
  filter_month text default null
)
returns json as $$
declare
  result json;
begin
  with attributed_charges as (
    select
      sr.name as rep_name,
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
