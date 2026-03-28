
-- Add notes and attachments columns to checklist_submissions
ALTER TABLE public.checklist_submissions
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Create audit-evidence storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('audit-evidence', 'audit-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload to their own folder
CREATE POLICY "Users can upload own evidence"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'audit-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS: authenticated users can view all evidence in their company (public bucket handles display)
CREATE POLICY "Anyone can view audit evidence"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'audit-evidence');

-- RLS: users can delete their own uploads
CREATE POLICY "Users can delete own evidence"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'audit-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);
