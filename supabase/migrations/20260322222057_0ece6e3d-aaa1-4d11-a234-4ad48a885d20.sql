
CREATE TABLE public.incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  user_id uuid NOT NULL,
  location_id uuid REFERENCES public.locations(id),
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  incident_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own incident reports"
ON public.incident_reports FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can view own incident reports"
ON public.incident_reports FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Managers can view company incident reports"
ON public.incident_reports FOR SELECT TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins can view company incident reports"
ON public.incident_reports FOR SELECT TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update company incident reports"
ON public.incident_reports FOR UPDATE TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can update company incident reports"
ON public.incident_reports FOR UPDATE TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_incident_reports_updated_at
  BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
