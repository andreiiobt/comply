
-- Manager can view sessions at their location
CREATE POLICY "Managers can view location sessions"
ON public.f2f_sessions FOR SELECT TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND has_role(auth.uid(), 'manager'::app_role)
  AND target_type = 'location'
  AND target_value IN (
    SELECT location_id::text FROM public.user_roles WHERE user_id = auth.uid() AND role = 'manager'
  )
);

-- Manager can insert sessions scoped to their location
CREATE POLICY "Managers can insert location sessions"
ON public.f2f_sessions FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND has_role(auth.uid(), 'manager'::app_role)
  AND target_type = 'location'
  AND target_value IN (
    SELECT location_id::text FROM public.user_roles WHERE user_id = auth.uid() AND role = 'manager'
  )
);

-- Manager can update sessions at their location
CREATE POLICY "Managers can update location sessions"
ON public.f2f_sessions FOR UPDATE TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND has_role(auth.uid(), 'manager'::app_role)
  AND target_type = 'location'
  AND target_value IN (
    SELECT location_id::text FROM public.user_roles WHERE user_id = auth.uid() AND role = 'manager'
  )
);

-- Manager can delete sessions at their location
CREATE POLICY "Managers can delete location sessions"
ON public.f2f_sessions FOR DELETE TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND has_role(auth.uid(), 'manager'::app_role)
  AND target_type = 'location'
  AND target_value IN (
    SELECT location_id::text FROM public.user_roles WHERE user_id = auth.uid() AND role = 'manager'
  )
);

-- Manager can view enrollments for their location sessions
CREATE POLICY "Managers can view location enrollments"
ON public.f2f_enrollments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM f2f_sessions s
    WHERE s.id = f2f_enrollments.session_id
    AND s.company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'manager'::app_role)
    AND s.target_type = 'location'
    AND s.target_value IN (
      SELECT location_id::text FROM public.user_roles WHERE user_id = auth.uid() AND role = 'manager'
    )
  )
);

-- Manager can update enrollments (attendance) for their location sessions
CREATE POLICY "Managers can update location enrollments"
ON public.f2f_enrollments FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM f2f_sessions s
    WHERE s.id = f2f_enrollments.session_id
    AND s.company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'manager'::app_role)
    AND s.target_type = 'location'
    AND s.target_value IN (
      SELECT location_id::text FROM public.user_roles WHERE user_id = auth.uid() AND role = 'manager'
    )
  )
);
