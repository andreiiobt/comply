
-- 1. Create junction table
CREATE TABLE public.user_custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  custom_role_id uuid NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, custom_role_id)
);

ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can view company user custom roles"
  ON public.user_custom_roles FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own custom roles"
  ON public.user_custom_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can insert user custom roles"
  ON public.user_custom_roles FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete user custom roles"
  ON public.user_custom_roles FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- 2. Migrate existing sub_role data
INSERT INTO public.user_custom_roles (user_id, custom_role_id, company_id)
SELECT ur.user_id, cr.id, ur.company_id
FROM public.user_roles ur
JOIN public.custom_roles cr ON cr.name = ur.sub_role AND cr.company_id = ur.company_id
WHERE ur.sub_role IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Update get_user_assignments to use junction table
CREATE OR REPLACE FUNCTION public.get_user_assignments(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        SELECT 1 FROM public.user_custom_roles ucr
        JOIN public.custom_roles cr ON cr.id = ucr.custom_role_id
        WHERE ucr.user_id = _user_id AND cr.name = pa.assign_sub_role
      ))
    );
END;
$function$;

-- 4. Update path_assignments RLS for users viewing own assignments
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
        SELECT 1 FROM user_custom_roles ucr
        JOIN custom_roles cr ON cr.id = ucr.custom_role_id
        WHERE ucr.user_id = auth.uid() AND cr.name = path_assignments.assign_sub_role
      ))
    )
  );
