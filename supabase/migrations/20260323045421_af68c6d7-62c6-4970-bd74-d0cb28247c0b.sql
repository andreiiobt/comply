ALTER TABLE public.checklist_assignments
  ADD COLUMN recurrence_type text NOT NULL DEFAULT 'none',
  ADD COLUMN recurrence_days integer[] DEFAULT NULL,
  ADD COLUMN recurrence_time time DEFAULT '09:00';