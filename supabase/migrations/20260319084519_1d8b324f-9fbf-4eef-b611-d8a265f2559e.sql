CREATE POLICY "Admins can update company profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND has_role(auth.uid(), 'admin'::app_role)
);