ALTER TABLE public.checklist_submissions ADD COLUMN template_title text;

UPDATE public.checklist_submissions cs
SET template_title = ct.title
FROM public.checklist_templates ct
WHERE ct.id = cs.template_id;