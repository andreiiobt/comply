
-- 1. Create f2f_sessions table
CREATE TABLE public.f2f_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  session_date timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  venue text,
  capacity integer,
  target_type text NOT NULL DEFAULT 'all',
  target_value text,
  created_by uuid NOT NULL,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.f2f_sessions ENABLE ROW LEVEL SECURITY;

-- Admin full CRUD
CREATE POLICY "Admins can view company sessions"
  ON public.f2f_sessions FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert sessions"
  ON public.f2f_sessions FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update sessions"
  ON public.f2f_sessions FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete sessions"
  ON public.f2f_sessions FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Learners can see published sessions targeted to them
CREATE POLICY "Users can view targeted published sessions"
  ON public.f2f_sessions FOR SELECT TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND is_published = true
    AND (
      target_type = 'all'
      OR (target_type = 'custom_role' AND EXISTS (
        SELECT 1 FROM public.user_custom_roles ucr
        JOIN public.custom_roles cr ON cr.id = ucr.custom_role_id
        WHERE ucr.user_id = auth.uid() AND cr.name = f2f_sessions.target_value
      ))
      OR (target_type = 'location' AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.location_id::text = f2f_sessions.target_value
      ))
    )
  );

-- updated_at trigger
CREATE TRIGGER update_f2f_sessions_updated_at
  BEFORE UPDATE ON public.f2f_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Create f2f_enrollments table
CREATE TABLE public.f2f_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.f2f_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'enrolled',
  UNIQUE(session_id, user_id)
);

ALTER TABLE public.f2f_enrollments ENABLE ROW LEVEL SECURITY;

-- Users can view own enrollments
CREATE POLICY "Users can view own enrollments"
  ON public.f2f_enrollments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can insert own enrollments
CREATE POLICY "Users can enroll themselves"
  ON public.f2f_enrollments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update own enrollments (cancel)
CREATE POLICY "Users can update own enrollments"
  ON public.f2f_enrollments FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all company enrollments
CREATE POLICY "Admins can view company enrollments"
  ON public.f2f_enrollments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.f2f_sessions s
    WHERE s.id = f2f_enrollments.session_id
    AND s.company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'admin'::app_role)
  ));

-- 3. Capacity enforcement trigger
CREATE OR REPLACE FUNCTION public.check_session_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'enrolled' AND (SELECT capacity FROM public.f2f_sessions WHERE id = NEW.session_id) IS NOT NULL
     AND (SELECT count(*) FROM public.f2f_enrollments
          WHERE session_id = NEW.session_id AND status = 'enrolled' AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid))
         >= (SELECT capacity FROM public.f2f_sessions WHERE id = NEW.session_id) THEN
    RAISE EXCEPTION 'Session is full';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_session_capacity
  BEFORE INSERT OR UPDATE ON public.f2f_enrollments
  FOR EACH ROW EXECUTE FUNCTION check_session_capacity();
