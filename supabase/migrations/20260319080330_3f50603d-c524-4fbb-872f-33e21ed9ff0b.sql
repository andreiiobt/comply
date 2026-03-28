
-- Add completed_by column to track who completed the checklist
ALTER TABLE public.checklist_submissions
  ADD COLUMN completed_by uuid;

-- Add unique constraint for upsert support (user_id, block_id)
-- Check if constraint exists first via DO block
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checklist_submissions_user_id_block_id_key'
  ) THEN
    ALTER TABLE public.checklist_submissions ADD CONSTRAINT checklist_submissions_user_id_block_id_key UNIQUE (user_id, block_id);
  END IF;
END $$;

-- Allow managers to insert checklist submissions on behalf of staff in their company
CREATE POLICY "Managers can insert submissions for staff"
ON public.checklist_submissions FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = checklist_submissions.user_id
      AND p.company_id = get_user_company_id(auth.uid())
  )
);

-- Allow managers to view company checklist submissions (they already can via existing policy)
-- Allow users to update own draft submissions
CREATE POLICY "Users can update own draft submissions"
ON public.checklist_submissions FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND status = 'draft');

-- Allow managers to view user_roles in their company for staff listing
CREATE POLICY "Managers can view company roles"
ON public.user_roles FOR SELECT TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'manager'::app_role));
