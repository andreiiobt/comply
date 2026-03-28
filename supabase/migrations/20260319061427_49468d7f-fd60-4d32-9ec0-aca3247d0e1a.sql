
ALTER TABLE public.path_assignments
  ADD COLUMN IF NOT EXISTS trigger_type text NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS trigger_days_after_join integer,
  ADD COLUMN IF NOT EXISTS prerequisite_path_id uuid REFERENCES public.learning_paths(id) ON DELETE SET NULL;

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
    )
    AND (
      pa.trigger_type = 'immediate'
      OR (pa.trigger_type = 'days_after_join' AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = _user_id
          AND p.created_at + (COALESCE(pa.trigger_days_after_join, 0) || ' days')::interval <= now()
      ))
      OR (pa.trigger_type = 'after_completion' AND pa.prerequisite_path_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.lessons l
        JOIN public.courses c ON c.id = l.course_id
        WHERE c.learning_path_id = pa.prerequisite_path_id
          AND l.is_published = true
          AND NOT EXISTS (
            SELECT 1 FROM public.user_progress up
            WHERE up.user_id = _user_id AND up.lesson_id = l.id AND up.completed = true
          )
      ))
    );
END;
$function$;
