-- Multitenancy Hardening Migration

-- 1. Fix Leaky checklist_submissions policies
DROP POLICY IF EXISTS "Admins managers can view submissions" ON public.checklist_submissions;
DROP POLICY IF EXISTS "Admins managers can review submissions" ON public.checklist_submissions;

CREATE POLICY "Admins/Managers can view company submissions" 
ON public.checklist_submissions FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles staff_p
    WHERE staff_p.user_id = checklist_submissions.user_id
    AND staff_p.company_id = get_user_company_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  )
);

CREATE POLICY "Admins/Managers can review company submissions" 
ON public.checklist_submissions FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles staff_p
    WHERE staff_p.user_id = checklist_submissions.user_id
    AND staff_p.company_id = get_user_company_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles staff_p
    WHERE staff_p.user_id = checklist_submissions.user_id
    AND staff_p.company_id = get_user_company_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  )
);

-- 2. Fix Leaky user_progress policies
DROP POLICY IF EXISTS "Admins can view company progress" ON public.user_progress;
DROP POLICY IF EXISTS "Managers can view company progress" ON public.user_progress;

CREATE POLICY "Admins/Managers can view company progress" 
ON public.user_progress FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles staff_p
    WHERE staff_p.user_id = user_progress.user_id
    AND staff_p.company_id = get_user_company_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  )
);

-- 3. Storage Hardening for user-licenses
-- Allow managers/admins to view documents of users in their company
DROP POLICY IF EXISTS "users_read_own_licenses" ON storage.objects;

CREATE POLICY "users_read_own_or_company_licenses"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-licenses' AND (
      (storage.foldername(name))[1] = auth.uid()::text -- Own folder
      OR 
      EXISTS (
        -- User's manager/admin in the same company
        SELECT 1 FROM public.profiles staff_p
        JOIN public.profiles admin_p ON admin_p.company_id = staff_p.company_id
        WHERE staff_p.user_id::text = (storage.foldername(name))[1]
        AND admin_p.user_id = auth.uid()
        AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
      )
    )
  );


-- 4. Audit other tables
-- Profiles: Ensure admins can only see company profiles
DROP POLICY IF EXISTS "Admins can view company profiles" ON public.profiles;
DROP POLICY IF EXISTS "Managers can view company profiles" ON public.profiles;

CREATE POLICY "Admins/Managers can view company profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));

-- User Roles
DROP POLICY IF EXISTS "Admins can view company roles" ON public.user_roles;
CREATE POLICY "Admins can view company roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));
