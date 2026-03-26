-- ============================================================================
-- Process a refund — finds the original charge and marks it refunded
-- ============================================================================

create or replace function process_samcart_refund(
  p_customer_email text,
  p_product_name text,
  p_refund_amount numeric,
  p_refund_date text default '',
  p_transaction_id text default ''
)
returns json as $$
declare
  v_charge_id uuid;
  v_contact_id uuid;
  v_refund_ts timestamptz;
begin
  v_refund_ts := case when p_refund_date != '' then p_refund_date::timestamptz else now() end;

  -- Find contact by email
  if p_customer_email != '' then
    select id into v_contact_id
    from contacts
    where email = p_customer_email
    limit 1;
  end if;

  -- Find the most recent matching charge for this contact + amount
  -- (the charge being refunded)
  if v_contact_id is not null then
    select id into v_charge_id
    from charges
    where contact_id = v_contact_id
      and amount = p_refund_amount
      and (refund_amount is null or refund_amount = 0)
    order by charge_date desc
    limit 1;
  end if;

  -- If no exact match, try by transaction ID
  if v_charge_id is null and p_transaction_id != '' then
    select id into v_charge_id
    from charges
    where samcart_transaction_id = p_transaction_id
    limit 1;
  end if;

  -- Update the charge with refund info
  if v_charge_id is not null then
    update charges
    set refund_amount = p_refund_amount,
        refund_date = v_refund_ts,
        subscription_status = 'refunded',
        updated_at = now()
    where id = v_charge_id;

    return json_build_object(
      'success', true,
      'charge_id', v_charge_id,
      'refund_amount', p_refund_amount
    );
  end if;

  -- No matching charge found — create a negative charge as a refund record
  insert into charges (
    contact_id, raw_title, product_variant, amount,
    source_platform, charge_date, metadata
  ) values (
    v_contact_id,
    'REFUND: ' || p_product_name || ' - ' || p_customer_email,
    p_product_name,
    -p_refund_amount,
    'samcart',
    v_refund_ts,
    jsonb_build_object('type', 'refund', 'original_transaction_id', p_transaction_id)
  )
  returning id into v_charge_id;

  return json_build_object(
    'success', true,
    'charge_id', v_charge_id,
    'created_as_negative', true,
    'refund_amount', p_refund_amount
  );
end;
$$ language plpgsql;
