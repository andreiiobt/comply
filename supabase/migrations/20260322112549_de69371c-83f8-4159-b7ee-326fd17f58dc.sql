
-- Create checklist_assignments table
CREATE TABLE public.checklist_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  assign_type text NOT NULL DEFAULT 'all',
  assign_value text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add category to checklist_templates
ALTER TABLE public.checklist_templates ADD COLUMN category text;

-- Enable RLS
ALTER TABLE public.checklist_assignments ENABLE ROW LEVEL SECURITY;

-- Admins full CRUD (company-scoped)
CREATE POLICY "Admins can select checklist assignments"
  ON public.checklist_assignments FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert checklist assignments"
  ON public.checklist_assignments FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update checklist assignments"
  ON public.checklist_assignments FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete checklist assignments"
  ON public.checklist_assignments FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- Managers can manage assignments for their location
CREATE POLICY "Managers can select checklist assignments"
  ON public.checklist_assignments FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can insert checklist assignments"
  ON public.checklist_assignments FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can update checklist assignments"
  ON public.checklist_assignments FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete checklist assignments"
  ON public.checklist_assignments FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'manager'));

-- Staff can view active assignments matching their roles/location
CREATE POLICY "Staff can view assigned checklists"
  ON public.checklist_assignments FOR SELECT TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND is_active = true
    AND (
      assign_type = 'all'
      OR (assign_type = 'location' AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.location_id::text = checklist_assignments.assign_value
      ))
      OR (assign_type = 'custom_role' AND EXISTS (
        SELECT 1 FROM public.user_custom_roles ucr
        JOIN public.custom_roles cr ON cr.id = ucr.custom_role_id
        WHERE ucr.user_id = auth.uid() AND cr.name = checklist_assignments.assign_value
      ))
      OR (assign_type = 'role' AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role::text = checklist_assignments.assign_value
      ))
    )
  );

-- Also allow managers to insert templates (for manager template creation)
CREATE POLICY "Managers can insert checklist templates"
  ON public.checklist_templates FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can update checklist templates"
  ON public.checklist_templates FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can select checklist templates"
  ON public.checklist_templates FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete checklist templates"
  ON public.checklist_templates FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'manager'));
