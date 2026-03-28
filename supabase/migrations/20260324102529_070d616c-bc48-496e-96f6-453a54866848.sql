
-- Create security definer function to check if caller is supervisor of target user
CREATE OR REPLACE FUNCTION public.is_supervisor_of(_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles sup_role
    JOIN public.user_roles target_role
      ON target_role.user_id = _target_user_id
      AND target_role.location_id = sup_role.location_id
    WHERE sup_role.user_id = auth.uid()
      AND sup_role.role = 'supervisor'
      AND target_role.role = 'staff'
      AND EXISTS (
        SELECT 1
        FROM public.user_custom_roles sup_cr
        JOIN public.user_custom_roles target_cr
          ON target_cr.custom_role_id = sup_cr.custom_role_id
          AND target_cr.user_id = _target_user_id
        WHERE sup_cr.user_id = auth.uid()
      )
  )
$$;

-- Supervisors can view submissions from their department staff
CREATE POLICY "Supervisors can view department submissions"
ON public.checklist_submissions
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'supervisor') AND is_supervisor_of(user_id));

-- Supervisors can approve/reject submissions from their department staff
CREATE POLICY "Supervisors can review department submissions"
ON public.checklist_submissions
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'supervisor') AND is_supervisor_of(user_id));

-- Supervisors can view incident reports for their location
CREATE POLICY "Supervisors can view location incidents"
ON public.incident_reports
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'supervisor')
  AND company_id = get_user_company_id(auth.uid())
  AND location_id IN (
    SELECT location_id FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'supervisor'
  )
);

-- Supervisors can insert incident reports
CREATE POLICY "Supervisors can insert incidents"
ON public.incident_reports
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'supervisor')
  AND company_id = get_user_company_id(auth.uid())
);

-- Supervisors can update incident reports for their location
CREATE POLICY "Supervisors can update location incidents"
ON public.incident_reports
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'supervisor')
  AND company_id = get_user_company_id(auth.uid())
  AND location_id IN (
    SELECT location_id FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'supervisor'
  )
);

-- Supervisors can view checklist assignments
CREATE POLICY "Supervisors can view checklist assignments"
ON public.checklist_assignments
FOR SELECT TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND has_role(auth.uid(), 'supervisor')
);

-- Supervisors can view published checklist templates
CREATE POLICY "Supervisors can view published templates"
ON public.checklist_templates
FOR SELECT TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND has_role(auth.uid(), 'supervisor')
  AND is_published = true
);
