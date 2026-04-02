-- Add local subscription state cache to companies table.
-- This is written by the polar-webhook function whenever Polar fires
-- subscription events, and by polar-sync-seats after a successful seat update.
-- The billing page continues to call polar-subscription-status for fresh data,
-- but other parts of the app (access gating, seat display) can read this cache.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS subscription_seats integer,
  ADD COLUMN IF NOT EXISTS subscription_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_product_name text,
  ADD COLUMN IF NOT EXISTS subscription_synced_at timestamptz;

COMMENT ON COLUMN public.companies.subscription_status IS 'Cached from Polar: active | trialing | canceled | inactive';
COMMENT ON COLUMN public.companies.subscription_seats IS 'Cached from Polar: current confirmed seat count';
COMMENT ON COLUMN public.companies.subscription_period_end IS 'Cached from Polar: next renewal or expiry date';
COMMENT ON COLUMN public.companies.subscription_cancel_at_period_end IS 'Cached from Polar: true if cancellation is scheduled';
COMMENT ON COLUMN public.companies.subscription_product_name IS 'Cached from Polar: plan/product display name';
COMMENT ON COLUMN public.companies.subscription_synced_at IS 'Timestamp of last successful cache write from Polar';
