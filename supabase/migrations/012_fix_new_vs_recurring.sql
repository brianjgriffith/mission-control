-- ============================================================================
-- Fix new vs recurring revenue classification
-- ============================================================================
-- New = first-ever charge for a contact + product group
-- Recurring = any subsequent charge for same contact + product group
-- ============================================================================

create or replace function get_rep_sales_from_charges(
  filter_month text default null,
  filter_rep_type text default null
)
returns json as $$
declare
  result json;
begin
  with charge_sequence as (
    -- For each charge, determine if it's the first purchase
    -- for this contact + product group (= new) or subsequent (= recurring)
    select
      c.id as charge_id,
      c.contact_id,
      c.amount,
      c.charge_date,
      c.refund_amount,
      coalesce(p.group_name, p.short_name, 'Other') as product_group,
      row_number() over (
        partition by c.contact_id, coalesce(p.group_name, p.short_name, 'Other')
        order by c.charge_date asc
      ) as seq
    from charges c
    left join products p on c.product_id = p.id
    where c.contact_id is not null
  ),
  attributed_charges as (
    select
      sr.name as rep_name,
      sr.rep_type,
      to_char(cs.charge_date, 'YYYY-MM') as month,
      cs.product_group as product,
      cs.amount,
      cs.refund_amount as charge_refund,
      cs.seq,
      ca.attribution_type
    from charge_attributions ca
    join sales_reps sr on ca.sales_rep_id = sr.id
    join charge_sequence cs on ca.charge_id = cs.charge_id
    where (filter_month is null or to_char(cs.charge_date, 'YYYY-MM') = filter_month)
      and (filter_rep_type is null or sr.rep_type = filter_rep_type)
  ),
  aggregated as (
    select
      rep_name,
      month,
      product,
      count(*) as deal_count,
      -- Only count seq=1 charges as "new deals"
      count(*) filter (where seq = 1) as new_deal_count,
      coalesce(sum(amount), 0) as amount,
      -- New revenue: first charge for this contact+product
      coalesce(sum(case when seq = 1 then amount else 0 end), 0) as new_amount,
      -- Recurring revenue: subsequent charges for same contact+product
      coalesce(sum(case when seq > 1 then amount else 0 end), 0) as recurring_amount,
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
      'deal_count', new_deal_count,
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
