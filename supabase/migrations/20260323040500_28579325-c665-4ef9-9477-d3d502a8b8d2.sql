ALTER TABLE public.checklist_submissions
  ADD COLUMN started_at timestamp with time zone,
  ADD COLUMN completed_at timestamp with time zone,
  ADD COLUMN duration_seconds integer;