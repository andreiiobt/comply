
-- Create assignment type enum
CREATE TYPE public.assign_type AS ENUM ('all', 'role', 'location', 'individual');

-- Create path_assignments table
CREATE TABLE public.path_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_path_id uuid NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assign_type assign_type NOT NULL,
  assign_role public.app_role,
  assign_location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  assign_user_id uuid,
  auto_assign boolean NOT NULL DEFAULT true,
  due_within_days integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.path_assignments ENABLE ROW LEVEL SECURITY;

-- Admin CRUD policies
CREATE POLICY "Admins can view assignments" ON public.path_assignments
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert assignments" ON public.path_assignments
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update assignments" ON public.path_assignments
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete assignments" ON public.path_assignments
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Staff/managers can see assignments that match them
CREATE POLICY "Users can view own assignments" ON public.path_assignments
  FOR SELECT TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND is_active = true
    AND (
      assign_type = 'all'
      OR (assign_type = 'individual' AND assign_user_id = auth.uid())
      OR (assign_type = 'role' AND EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = assign_role
      ))
      OR (assign_type = 'location' AND EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.location_id = assign_location_id
      ))
    )
  );

-- Security definer function to get assigned path IDs for a user
CREATE OR REPLACE FUNCTION public.get_user_assignments(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT pa.learning_path_id
  FROM public.path_assignments pa
  WHERE pa.company_id = get_user_company_id(_user_id)
    AND pa.is_active = true
    AND (
      pa.assign_type = 'all'
      OR (pa.assign_type = 'individual' AND pa.assign_user_id = _user_id)
      OR (pa.assign_type = 'role' AND EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = pa.assign_role
      ))
      OR (pa.assign_type = 'location' AND EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.location_id = pa.assign_location_id
      ))
    )
$$;
