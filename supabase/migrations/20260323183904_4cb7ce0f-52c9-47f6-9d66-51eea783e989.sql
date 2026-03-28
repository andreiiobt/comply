-- Fix user_progress: Admin SELECT - add company scoping
DROP POLICY "Admins can view company progress" ON user_progress;
CREATE POLICY "Admins can view company progress" ON user_progress
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND get_user_company_id(user_id) = get_user_company_id(auth.uid())
  );

-- Fix user_progress: Manager SELECT - add company scoping
DROP POLICY "Managers can view company progress" ON user_progress;
CREATE POLICY "Managers can view company progress" ON user_progress
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND get_user_company_id(user_id) = get_user_company_id(auth.uid())
  );