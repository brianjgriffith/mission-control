-- ============================================================================
-- Update sales RPC to properly handle refunds
-- ============================================================================
-- Refunds are tracked as either:
-- 1. charge.refund_amount > 0 (refunded charge)
-- 2. charge.amount < 0 (negative refund record)
-- Both should be deducted from the rep's totals.
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
    select
      c.id as charge_id,
      c.amount,
      c.charge_date,
      coalesce(c.refund_amount, 0) as refund_amt,
      coalesce(p.group_name, p.short_name, 'Other') as product_group,
      case
        when c.contact_id is null then 1
        else row_number() over (
          partition by c.contact_id, coalesce(p.group_name, p.short_name, 'Other')
          order by c.charge_date asc
        )
      end as seq
    from charges c
    left join products p on c.product_id = p.id
    where c.amount > 0  -- exclude negative refund records from main calc
  ),
  -- Also get negative refund records separately
  refund_records as (
    select
      ca.sales_rep_id,
      to_char(c.charge_date, 'YYYY-MM') as month,
      coalesce(p.group_name, p.short_name, 'Other') as product_group,
      abs(c.amount) as refund_amount
    from charges c
    join charge_attributions ca on ca.charge_id = c.id
    join sales_reps sr on ca.sales_rep_id = sr.id
    left join products p on c.product_id = p.id
    where c.amount < 0
      and (filter_month is null or to_char(c.charge_date, 'YYYY-MM') = filter_month)
      and (filter_rep_type is null or sr.rep_type = filter_rep_type)
  ),
  attributed_charges as (
    select
      sr.name as rep_name,
      sr.rep_type,
      sr.id as rep_id,
      to_char(cs.charge_date, 'YYYY-MM') as month,
      cs.product_group as product,
      cs.amount,
      cs.refund_amt,
      cs.seq
    from charge_attributions ca
    join sales_reps sr on ca.sales_rep_id = sr.id
    join charge_sequence cs on ca.charge_id = cs.charge_id
    where (filter_month is null or to_char(cs.charge_date, 'YYYY-MM') = filter_month)
      and (filter_rep_type is null or sr.rep_type = filter_rep_type)
  ),
  aggregated as (
    select
      ac.rep_name,
      ac.rep_id,
      ac.month,
      ac.product,
      count(*) filter (where ac.seq = 1) as deal_count,
      coalesce(sum(ac.amount), 0) as gross_amount,
      coalesce(sum(case when ac.seq = 1 then ac.amount else 0 end), 0) as new_amount,
      coalesce(sum(case when ac.seq > 1 then ac.amount else 0 end), 0) as recurring_amount,
      -- Refunds from refund_amount field on charges
      coalesce(sum(ac.refund_amt), 0) as charge_refunds,
      -- Refunds from negative refund records
      coalesce((
        select sum(rr.refund_amount) from refund_records rr
        where rr.sales_rep_id = ac.rep_id
          and rr.month = ac.month
          and rr.product_group = ac.product
      ), 0) as negative_refunds
    from attributed_charges ac
    group by ac.rep_name, ac.rep_id, ac.month, ac.product
    order by ac.month, ac.rep_name, ac.product
  )
  select coalesce(
    json_agg(json_build_object(
      'id', rep_name || '-' || month || '-' || product,
      'rep_name', rep_name,
      'month', month,
      'product', product,
      'amount', gross_amount - charge_refunds - negative_refunds,
      'new_amount', new_amount,
      'recurring_amount', recurring_amount,
      'deal_count', deal_count,
      'booked_calls', 0,
      'refund_amount', charge_refunds + negative_refunds,
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
