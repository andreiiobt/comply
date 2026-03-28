
-- The 'supervisor' value was already added to app_role enum in a previous migration.
-- Re-add it safely in case it wasn't committed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'supervisor' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'supervisor' BEFORE 'staff';
  END IF;
END
$$;
