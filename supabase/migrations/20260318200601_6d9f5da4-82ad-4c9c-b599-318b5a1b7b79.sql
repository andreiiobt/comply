
ALTER TABLE public.f2f_enrollments ADD COLUMN attended boolean NOT NULL DEFAULT false;

CREATE POLICY "Admins can update enrollments"
ON public.f2f_enrollments FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM f2f_sessions s
  WHERE s.id = f2f_enrollments.session_id
    AND s.company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'admin')
));
