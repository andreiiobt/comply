
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS merge_employee_id text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_merge_employee_id_key ON public.profiles (merge_employee_id) WHERE merge_employee_id IS NOT NULL;

CREATE TABLE public.hris_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  merge_account_token text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sync_interval_hours integer NOT NULL DEFAULT 24,
  last_synced_at timestamptz,
  field_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

ALTER TABLE public.hris_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view own company integrations" ON public.hris_integrations
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert own company integrations" ON public.hris_integrations
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update own company integrations" ON public.hris_integrations
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete own company integrations" ON public.hris_integrations
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.hris_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  users_created integer NOT NULL DEFAULT 0,
  users_updated integer NOT NULL DEFAULT 0,
  users_deactivated integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hris_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view own company sync logs" ON public.hris_sync_log
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert sync logs" ON public.hris_sync_log
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access integrations" ON public.hris_integrations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access sync log" ON public.hris_sync_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
