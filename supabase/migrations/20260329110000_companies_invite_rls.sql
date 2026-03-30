-- Allow anyone (anon or authenticated) to read a company's name
-- when they hold a pending, non-expired invite for that company.
-- This is needed so the /invite/:code page can display the company name
-- before the user has logged in or joined.
CREATE POLICY "Anyone can view company via pending invite"
  ON public.companies
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invitations
      WHERE company_id = id
        AND status = 'pending'
        AND expires_at > now()
    )
  );
