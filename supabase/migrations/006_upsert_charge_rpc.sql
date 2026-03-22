-- ============================================================================
-- Upsert charge from HubSpot — called by n8n daily sync workflow
-- ============================================================================
-- Takes raw HubSpot charge data, finds/creates contact, matches product,
-- and upserts the charge record. Returns the charge ID.
-- ============================================================================

create or replace function upsert_charge_from_hubspot(
  p_hubspot_id text,
  p_charge_name text,
  p_amount numeric,
  p_contact_email text,
  p_product_name text default '',
  p_payment_type text default '',
  p_payment_status text default '',
  p_payment_date text default '',
  p_processor text default ''
)
returns json as $$
declare
  v_contact_id uuid;
  v_product_id uuid;
  v_charge_id uuid;
  v_source_platform text;
  v_payment_plan text;
  v_charge_date timestamptz;
begin
  -- 1. Find or create contact by email
  if p_contact_email is not null and p_contact_email != '' then
    select id into v_contact_id
    from contacts
    where email = p_contact_email
    limit 1;

    if v_contact_id is null then
      insert into contacts (hubspot_contact_id, email)
      values ('email-' || p_contact_email, p_contact_email)
      on conflict (hubspot_contact_id) do update set email = excluded.email
      returning id into v_contact_id;
    end if;
  end if;

  -- 2. Match product via title mappings (ordered by priority desc)
  select ptm.product_id into v_product_id
  from product_title_mappings ptm
  where (ptm.match_type = 'contains' and (p_product_name ilike '%' || ptm.title_pattern || '%'
         or p_charge_name ilike '%' || ptm.title_pattern || '%'))
     or (ptm.match_type = 'starts_with' and (p_product_name ilike ptm.title_pattern || '%'
         or p_charge_name ilike ptm.title_pattern || '%'))
  order by ptm.priority desc
  limit 1;

  -- 3. Determine source platform
  v_source_platform := case
    when lower(p_processor) like '%samcart%' then 'samcart'
    when lower(p_processor) like '%kajabi%' then 'kajabi'
    else 'hubspot'
  end;

  -- 4. Determine payment plan type
  v_payment_plan := case
    when p_payment_type = 'subscription' then 'subscription'
    when p_payment_type = 'multipay' then 'installment'
    when p_payment_type = 'onetime' or p_payment_type = 'one_time' then 'one_time'
    when p_payment_type != '' then p_payment_type
    else null
  end;

  -- 5. Parse charge date
  v_charge_date := case
    when p_payment_date != '' then p_payment_date::timestamptz
    else now()
  end;

  -- 6. Upsert charge
  insert into charges (
    contact_id, hubspot_charge_id, product_id, raw_title,
    product_variant, amount, source_platform, payment_plan_type,
    charge_date
  ) values (
    v_contact_id, p_hubspot_id, v_product_id, p_charge_name,
    p_product_name, p_amount, v_source_platform, v_payment_plan,
    v_charge_date
  )
  on conflict (hubspot_charge_id) do update set
    product_id = coalesce(excluded.product_id, charges.product_id),
    amount = excluded.amount,
    product_variant = excluded.product_variant,
    source_platform = excluded.source_platform,
    payment_plan_type = excluded.payment_plan_type,
    updated_at = now()
  returning id into v_charge_id;

  return json_build_object(
    'charge_id', v_charge_id,
    'contact_id', v_contact_id,
    'product_id', v_product_id,
    'source_platform', v_source_platform
  );
end;
$$ language plpgsql;
