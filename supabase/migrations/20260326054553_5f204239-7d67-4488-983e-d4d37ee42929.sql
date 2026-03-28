
-- Version history table for checklist templates
CREATE TABLE public.checklist_template_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  description text,
  category text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  change_summary text,
  UNIQUE (template_id, version_number)
);

-- RLS
ALTER TABLE public.checklist_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view template versions"
  ON public.checklist_template_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.checklist_templates ct
    WHERE ct.id = checklist_template_versions.template_id
      AND ct.company_id = get_user_company_id(auth.uid())
      AND has_role(auth.uid(), 'admin'::app_role)
  ));

CREATE POLICY "Managers can view template versions"
  ON public.checklist_template_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.checklist_templates ct
    WHERE ct.id = checklist_template_versions.template_id
      AND ct.company_id = get_user_company_id(auth.uid())
      AND has_role(auth.uid(), 'manager'::app_role)
  ));

CREATE POLICY "Admins can insert template versions"
  ON public.checklist_template_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.checklist_templates ct
    WHERE ct.id = checklist_template_versions.template_id
      AND ct.company_id = get_user_company_id(auth.uid())
      AND has_role(auth.uid(), 'admin'::app_role)
  ));

CREATE POLICY "Managers can insert template versions"
  ON public.checklist_template_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.checklist_templates ct
    WHERE ct.id = checklist_template_versions.template_id
      AND ct.company_id = get_user_company_id(auth.uid())
      AND has_role(auth.uid(), 'manager'::app_role)
  ));

-- Add template_snapshot to submissions to freeze items at submit time
ALTER TABLE public.checklist_submissions
  ADD COLUMN template_snapshot jsonb;
