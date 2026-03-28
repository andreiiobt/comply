ALTER TABLE public.incident_reports
  ADD COLUMN assigned_to uuid,
  ADD COLUMN involved_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb;