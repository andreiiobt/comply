DROP POLICY IF EXISTS "Anyone can check setup status" ON public.setup_completed;
DROP POLICY IF EXISTS "Anon can check setup" ON public.setup_completed;
DROP POLICY IF EXISTS "Allow anon to check setup" ON public.setup_completed;

CREATE OR REPLACE FUNCTION public.is_setup_complete()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT completed FROM public.setup_completed WHERE id = 1), false);
$$;

CREATE POLICY "Authenticated can view setup status"
ON public.setup_completed
FOR SELECT
TO authenticated
USING (true);