
ALTER TABLE public.checklist_submissions 
  ADD COLUMN template_id uuid REFERENCES public.checklist_templates(id),
  ALTER COLUMN block_id DROP NOT NULL,
  ALTER COLUMN lesson_id DROP NOT NULL;
