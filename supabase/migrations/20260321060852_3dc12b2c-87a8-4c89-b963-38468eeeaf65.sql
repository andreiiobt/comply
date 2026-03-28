
ALTER TABLE public.learning_paths ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Users can view published learning paths" ON public.learning_paths;

CREATE POLICY "Users can view published learning paths"
ON public.learning_paths
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND (
    (is_published = true AND is_archived = false)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);
