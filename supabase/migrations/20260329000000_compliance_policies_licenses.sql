-- ================================================================
-- COMPLIANCE: Policies & Licenses
-- ================================================================

-- 1. POLICIES table
CREATE TABLE IF NOT EXISTS public.policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title           text NOT NULL,
  body            text NOT NULL DEFAULT '',          -- markdown content
  agreement_mode  text NOT NULL DEFAULT 'manual'     -- 'manual' | 'auto'
                  CHECK (agreement_mode IN ('manual','auto')),
  version         integer NOT NULL DEFAULT 1,
  is_published    boolean NOT NULL DEFAULT false,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

-- Admin: full access to their company's policies
CREATE POLICY "admin_manage_policies"
  ON public.policies
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Staff/Manager/Supervisor: read published policies for their company
CREATE POLICY "staff_view_policies"
  ON public.policies
  FOR SELECT
  USING (
    is_published = true AND
    company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );


-- 2. POLICY_AGREEMENTS table
CREATE TABLE IF NOT EXISTS public.policy_agreements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id       uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agreed_at       timestamptz NOT NULL DEFAULT now(),
  policy_version  integer NOT NULL DEFAULT 1,
  UNIQUE (policy_id, user_id, policy_version)
);

ALTER TABLE public.policy_agreements ENABLE ROW LEVEL SECURITY;

-- Users can insert/read their own agreements
CREATE POLICY "users_manage_own_agreements"
  ON public.policy_agreements
  FOR ALL
  USING (user_id = auth.uid());

-- Admins can read all agreements for their company's policies
CREATE POLICY "admin_read_agreements"
  ON public.policy_agreements
  FOR SELECT
  USING (
    policy_id IN (
      SELECT id FROM public.policies
      WHERE company_id IN (
        SELECT company_id FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );


-- 3. USER_LICENSES table
CREATE TABLE IF NOT EXISTS public.user_licenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  license_name    text NOT NULL,
  license_number  text,
  issued_at       date,
  expires_at      date,
  document_url    text,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','expired','pending')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_licenses ENABLE ROW LEVEL SECURITY;

-- Users manage their own licenses
CREATE POLICY "users_manage_own_licenses"
  ON public.user_licenses
  FOR ALL
  USING (user_id = auth.uid());

-- Admins can view all licenses for their company
CREATE POLICY "admin_view_licenses"
  ON public.user_licenses
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );


-- 4. Updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER policies_updated_at  BEFORE UPDATE ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER user_licenses_updated_at BEFORE UPDATE ON public.user_licenses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 5. Storage bucket for license documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-licenses',
  'user-licenses',
  true,
  10485760, -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage: users can manage files in their own folder
CREATE POLICY "users_upload_own_licenses"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'user-licenses' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "users_read_own_licenses"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'user-licenses' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "users_delete_own_licenses"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'user-licenses' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
