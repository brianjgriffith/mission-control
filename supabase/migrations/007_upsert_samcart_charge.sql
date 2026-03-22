-- ============================================================================
-- Upsert charge from SamCart webhook — called by n8n SamCart sync
-- ============================================================================
-- Handles the richer SamCart data: affiliate attribution, subscription ID,
-- coupon, and processor info. Creates/finds contact, matches product,
-- links affiliate to sales rep, and upserts the charge.
-- ============================================================================

create or replace function upsert_samcart_charge(
  p_samcart_transaction_id text,
  p_customer_email text,
  p_customer_first_name text default '',
  p_customer_last_name text default '',
  p_product_name text default '',
  p_amount numeric default 0,
  p_processor text default 'SamCart',
  p_subscription_id text default '',
  p_affiliate_id text default '',
  p_affiliate_name text default '',
  p_coupon_code text default '',
  p_order_date text default '',
  p_event_type text default 'Order'
)
returns json as $$
declare
  v_contact_id uuid;
  v_product_id uuid;
  v_charge_id uuid;
  v_payment_plan text;
  v_charge_date timestamptz;
  v_is_subscription boolean;
begin
  -- Skip if no transaction ID
  if p_samcart_transaction_id is null or p_samcart_transaction_id = '' then
    return json_build_object('error', 'No transaction ID provided');
  end if;

  -- 1. Find or create contact by email
  if p_customer_email is not null and p_customer_email != '' then
    select id into v_contact_id
    from contacts
    where email = p_customer_email
    limit 1;

    if v_contact_id is null then
      insert into contacts (hubspot_contact_id, email, first_name, last_name)
      values ('samcart-' || p_customer_email, p_customer_email, p_customer_first_name, p_customer_last_name)
      on conflict (hubspot_contact_id) do update
        set first_name = coalesce(nullif(excluded.first_name, ''), contacts.first_name),
            last_name = coalesce(nullif(excluded.last_name, ''), contacts.last_name)
      returning id into v_contact_id;
    end if;
  end if;

  -- 2. Match product via title mappings
  select ptm.product_id into v_product_id
  from product_title_mappings ptm
  where ptm.match_type = 'contains' and p_product_name ilike '%' || ptm.title_pattern || '%'
  order by ptm.priority desc
  limit 1;

  -- 3. Determine payment plan
  v_is_subscription := (p_subscription_id is not null and p_subscription_id != '' and p_subscription_id != '0');
  v_payment_plan := case when v_is_subscription then 'subscription' else 'one_time' end;

  -- 4. Parse order date
  v_charge_date := case
    when p_order_date != '' then p_order_date::timestamptz
    else now()
  end;

  -- 5. Upsert charge with SamCart enrichment
  insert into charges (
    contact_id,
    samcart_transaction_id,
    product_id,
    raw_title,
    product_variant,
    amount,
    source_platform,
    payment_plan_type,
    affiliate_id,
    affiliate_name,
    subscription_status,
    charge_date,
    pending_samcart_enrichment,
    metadata
  ) values (
    v_contact_id,
    p_samcart_transaction_id,
    v_product_id,
    p_product_name || ' - ' || p_customer_email || ' - $' || p_amount::text,
    p_product_name,
    p_amount,
    'samcart',
    v_payment_plan,
    nullif(p_affiliate_id, ''),
    nullif(p_affiliate_name, ''),
    case when v_is_subscription then 'active' else null end,
    v_charge_date,
    false,
    jsonb_build_object(
      'samcart_subscription_id', p_subscription_id,
      'coupon_code', p_coupon_code,
      'processor', p_processor,
      'event_type', p_event_type
    )
  )
  on conflict (samcart_transaction_id) do update set
    product_id = coalesce(excluded.product_id, charges.product_id),
    amount = excluded.amount,
    affiliate_id = coalesce(excluded.affiliate_id, charges.affiliate_id),
    affiliate_name = coalesce(excluded.affiliate_name, charges.affiliate_name),
    subscription_status = coalesce(excluded.subscription_status, charges.subscription_status),
    pending_samcart_enrichment = false,
    metadata = excluded.metadata,
    updated_at = now()
  returning id into v_charge_id;

  -- 6. Auto-attribute to sales rep if affiliate matches
  if p_affiliate_name is not null and p_affiliate_name != '' and v_charge_id is not null then
    declare
      v_rep_id uuid;
    begin
      -- Try to match affiliate name to a sales rep
      select id into v_rep_id
      from sales_reps
      where name ilike '%' || split_part(p_affiliate_name, ' ', 1) || '%'
        and is_active = true
      limit 1;

      if v_rep_id is not null then
        insert into charge_attributions (charge_id, sales_rep_id, attribution_type)
        values (v_charge_id, v_rep_id, 'affiliate')
        on conflict (charge_id) do update set
          sales_rep_id = excluded.sales_rep_id,
          attribution_type = 'affiliate';
      end if;
    end;
  end if;

  return json_build_object(
    'charge_id', v_charge_id,
    'contact_id', v_contact_id,
    'product_id', v_product_id,
    'affiliate_name', p_affiliate_name,
    'is_subscription', v_is_subscription,
    'event_type', p_event_type
  );
end;
$$ language plpgsql;
