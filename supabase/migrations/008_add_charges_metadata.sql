-- Add metadata jsonb column to charges table (was referenced by
-- upsert_samcart_charge RPC but missing from the table)
alter table charges add column if not exists metadata jsonb default '{}';
