
-- 1. Create custom_roles table
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company custom roles"
ON public.custom_roles FOR SELECT TO authenticated
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can insert custom roles"
ON public.custom_roles FOR INSERT TO authenticated
WITH CHECK (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete custom roles"
ON public.custom_roles FOR DELETE TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update custom roles"
ON public.custom_roles FOR UPDATE TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- 2. Add sub_role to assign_type enum
ALTER TYPE public.assign_type ADD VALUE 'sub_role';

-- 3. Add assign_sub_role column to path_assignments
ALTER TABLE public.path_assignments ADD COLUMN assign_sub_role text;

-- 4. Add sub_role column to invitations
ALTER TABLE public.invitations ADD COLUMN sub_role text;
