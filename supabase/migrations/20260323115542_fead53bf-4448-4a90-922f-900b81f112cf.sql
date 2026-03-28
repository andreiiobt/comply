
-- Fix SELECT: scope to same company
DROP POLICY "Admins managers can view submissions" ON checklist_submissions;
CREATE POLICY "Admins managers can view submissions" ON checklist_submissions
  FOR SELECT TO authenticated
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
    AND get_user_company_id(user_id) = get_user_company_id(auth.uid())
  );

-- Fix UPDATE: scope to same company
DROP POLICY "Admins managers can review submissions" ON checklist_submissions;
CREATE POLICY "Admins managers can review submissions" ON checklist_submissions
  FOR UPDATE TO authenticated
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
    AND get_user_company_id(user_id) = get_user_company_id(auth.uid())
  );
