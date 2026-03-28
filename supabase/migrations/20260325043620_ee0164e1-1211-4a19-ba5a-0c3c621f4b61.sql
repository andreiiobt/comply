
-- Create location_tags table
CREATE TABLE public.location_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE public.location_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company location tags" ON public.location_tags
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can insert location tags" ON public.location_tags
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update location tags" ON public.location_tags
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete location tags" ON public.location_tags
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- Create location_tag_assignments junction table
CREATE TABLE public.location_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.location_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id, tag_id)
);

ALTER TABLE public.location_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company tag assignments" ON public.location_tag_assignments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = location_tag_assignments.location_id
      AND l.company_id = get_user_company_id(auth.uid())
  ));

CREATE POLICY "Admins can insert tag assignments" ON public.location_tag_assignments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = location_tag_assignments.location_id
      AND l.company_id = get_user_company_id(auth.uid())
      AND has_role(auth.uid(), 'admin')
  ));

CREATE POLICY "Admins can delete tag assignments" ON public.location_tag_assignments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = location_tag_assignments.location_id
      AND l.company_id = get_user_company_id(auth.uid())
      AND has_role(auth.uid(), 'admin')
  ));

-- Update the staff checklist_assignments RLS policy to support location_tag
DROP POLICY "Staff can view assigned checklists" ON public.checklist_assignments;

CREATE POLICY "Staff can view assigned checklists" ON public.checklist_assignments
  FOR SELECT TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND is_active = true
    AND (
      assign_type = 'all'
      OR (assign_type = 'location' AND EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.location_id::text = checklist_assignments.assign_value
      ))
      OR (assign_type = 'custom_role' AND EXISTS (
        SELECT 1 FROM user_custom_roles ucr
        JOIN custom_roles cr ON cr.id = ucr.custom_role_id
        WHERE ucr.user_id = auth.uid() AND cr.name = checklist_assignments.assign_value
      ))
      OR (assign_type = 'role' AND EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role::text = checklist_assignments.assign_value
      ))
      OR (assign_type = 'location_tag' AND EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN location_tag_assignments lta ON lta.location_id = ur.location_id
        WHERE ur.user_id = auth.uid()
          AND lta.tag_id::text = checklist_assignments.assign_value
      ))
    )
  );
