-- ============================================================================
-- Unmatched charges grouping function
-- ============================================================================
-- Groups unmatched charges by product_variant, with count and total revenue.
-- Used by the admin unmatched management UI.
-- ============================================================================

create or replace function get_unmatched_charge_groups()
returns json as $$
declare
  result json;
begin
  with groups as (
    select
      coalesce(nullif(product_variant, ''), 'Unknown') as title,
      count(*) as charge_count,
      sum(amount) as total_revenue,
      min(charge_date) as earliest,
      max(charge_date) as latest
    from charges
    where product_id is null
    group by coalesce(nullif(product_variant, ''), 'Unknown')
    order by count(*) desc
  )
  select json_build_object(
    'total_unmatched', (select count(*) from charges where product_id is null),
    'total_revenue', (select coalesce(sum(amount), 0) from charges where product_id is null),
    'groups', coalesce((select json_agg(json_build_object(
      'title', title,
      'charge_count', charge_count,
      'total_revenue', total_revenue,
      'earliest', earliest,
      'latest', latest
    )) from groups), '[]'::json)
  ) into result;

  return result;
end;
$$ language plpgsql stable;

-- ============================================================================
-- Assign product to charges by title pattern
-- ============================================================================
-- Matches charges where product_variant contains the pattern and product_id is null.
-- Also creates a product_title_mapping for future charges.
-- Returns the number of charges updated.
-- ============================================================================

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
  -- Update matching charges
  update charges
  set product_id = target_product_id,
      updated_at = now()
  where product_id is null
    and (product_variant ilike '%' || pattern || '%'
         or raw_title ilike '%' || pattern || '%');

  get diagnostics updated_count = row_count;

  -- Create a title mapping for future charges (ignore if exists)
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
