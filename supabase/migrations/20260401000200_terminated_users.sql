-- Soft-delete support: mark users as terminated rather than wiping their data.
-- The delete-user function now sets this timestamp and bans the auth account
-- instead of permanently removing the profile and its related rows.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terminated_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.profiles.terminated_at IS 'Set when a user is terminated. Null = active. The auth account is banned simultaneously so they cannot log in.';
