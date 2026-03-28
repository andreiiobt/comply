ALTER TABLE public.checklist_submissions
  DROP CONSTRAINT checklist_submissions_template_id_fkey,
  ADD CONSTRAINT checklist_submissions_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES public.checklist_templates(id) ON DELETE CASCADE;