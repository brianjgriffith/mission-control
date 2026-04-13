-- Add daily_tracking flag to funnels table
-- When true, this funnel is recomputed daily (in addition to the weekly full recompute)
ALTER TABLE funnels ADD COLUMN daily_tracking boolean NOT NULL DEFAULT false;
