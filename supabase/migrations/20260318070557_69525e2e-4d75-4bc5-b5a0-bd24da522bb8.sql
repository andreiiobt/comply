
-- Update get_user_assignments function to handle sub_role
CREATE OR REPLACE FUNCTION public.get_user_assignments(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT pa.learning_path_id
  FROM public.path_assignments pa
  WHERE pa.company_id = get_user_company_id(_user_id)
    AND pa.is_active = true
    AND (
      pa.assign_type = 'all'::assign_type
      OR (pa.assign_type = 'individual'::assign_type AND pa.assign_user_id = _user_id)
      OR (pa.assign_type = 'role'::assign_type AND EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = pa.assign_role
      ))
      OR (pa.assign_type = 'location'::assign_type AND EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.location_id = pa.assign_location_id
      ))
      OR (pa.assign_type = 'sub_role'::assign_type AND EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.sub_role = pa.assign_sub_role
      ))
    );
END;
$$;

-- Update path_assignments RLS for users to handle sub_role
DROP POLICY IF EXISTS "Users can view own assignments" ON public.path_assignments;
CREATE POLICY "Users can view own assignments"
ON public.path_assignments FOR SELECT TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_active = true
  AND (
    assign_type = 'all'::assign_type
    OR (assign_type = 'individual'::assign_type AND assign_user_id = auth.uid())
    OR (assign_type = 'role'::assign_type AND EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = path_assignments.assign_role
    ))
    OR (assign_type = 'location'::assign_type AND EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.location_id = path_assignments.assign_location_id
    ))
    OR (assign_type = 'sub_role'::assign_type AND EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.sub_role = path_assignments.assign_sub_role
    ))
  )
);
