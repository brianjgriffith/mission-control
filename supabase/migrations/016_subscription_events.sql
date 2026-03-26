-- ============================================================================
-- Process subscription lifecycle events from SamCart webhooks
-- ============================================================================
-- Handles: Subscription Canceled, Subscription Payment Failed,
--          Subscription Restarted
-- Updates the charge's subscription_status and logs a journey_event.
-- ============================================================================

create or replace function process_subscription_event(
  p_customer_email text,
  p_subscription_id text,
  p_event_type text,  -- 'Subscription Canceled', 'Subscription Payment Failed', 'Subscription Restarted'
  p_product_name text default '',
  p_event_date text default ''
)
returns json as $$
declare
  v_contact_id uuid;
  v_charge_id uuid;
  v_new_status text;
  v_journey_event_type text;
  v_event_ts timestamptz;
begin
  -- 1. Parse event date
  v_event_ts := case when p_event_date != '' then p_event_date::timestamptz else now() end;

  -- 2. Map SamCart event type to subscription_status and journey event type
  case p_event_type
    when 'Subscription Canceled' then
      v_new_status := 'cancelled';
      v_journey_event_type := 'cancel';
    when 'Subscription Payment Failed' then
      v_new_status := 'failed';
      v_journey_event_type := 'payment_failed';
    when 'Subscription Restarted' then
      v_new_status := 'active';
      v_journey_event_type := 'restart';
    else
      return json_build_object('error', 'Unknown event type: ' || p_event_type);
  end case;

  -- 3. Find contact by email
  if p_customer_email is null or p_customer_email = '' then
    return json_build_object('error', 'No customer email provided');
  end if;

  select id into v_contact_id
  from contacts
  where email = p_customer_email
  limit 1;

  if v_contact_id is null then
    return json_build_object(
      'success', false,
      'error', 'Contact not found for email: ' || p_customer_email
    );
  end if;

  -- 4. Find the most recent charge matching subscription_id or product name
  --    Prefer subscription_id match, fall back to product name match
  if p_subscription_id is not null and p_subscription_id != '' and p_subscription_id != '0' then
    select id into v_charge_id
    from charges
    where contact_id = v_contact_id
      and metadata->>'samcart_subscription_id' = p_subscription_id
    order by charge_date desc
    limit 1;
  end if;

  -- Fall back to product name match if no subscription_id match
  if v_charge_id is null and p_product_name != '' then
    select id into v_charge_id
    from charges
    where contact_id = v_contact_id
      and product_variant ilike '%' || p_product_name || '%'
    order by charge_date desc
    limit 1;
  end if;

  -- 5. Update the charge's subscription_status
  if v_charge_id is not null then
    update charges
    set subscription_status = v_new_status,
        updated_at = now()
    where id = v_charge_id;
  end if;

  -- 6. Log a journey event regardless of whether we found a charge
  insert into journey_events (
    contact_id,
    event_type,
    event_date,
    charge_id,
    source,
    metadata
  ) values (
    v_contact_id,
    v_journey_event_type,
    v_event_ts,
    v_charge_id,
    'samcart',
    jsonb_build_object(
      'samcart_event_type', p_event_type,
      'subscription_id', p_subscription_id,
      'product_name', p_product_name
    )
  );

  return json_build_object(
    'success', true,
    'charge_id', v_charge_id,
    'event_logged', true,
    'new_status', v_new_status,
    'journey_event_type', v_journey_event_type
  );
end;
$$ language plpgsql;
