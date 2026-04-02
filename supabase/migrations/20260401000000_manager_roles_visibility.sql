-- Allow managers to view user_roles for their company
-- Without this, managers could not load the staff list for their location,
-- so the submissions page showed nothing (the staffIds query returned empty).

CREATE POLICY "Managers can view company roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'manager'));
