-- ================================================================
-- POLICIES: Document uploads & version history
-- ================================================================

-- 1. POLICY_DOCUMENTS — files attached to a policy
CREATE TABLE IF NOT EXISTS public.policy_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id   uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  file_url    text NOT NULL,
  file_type   text NOT NULL,
  file_size   integer NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.policy_documents ENABLE ROW LEVEL SECURITY;

-- Admin: full access to documents for their company's policies
CREATE POLICY "admin_manage_policy_documents"
  ON public.policy_documents
  FOR ALL
  USING (
    policy_id IN (
      SELECT id FROM public.policies
      WHERE company_id IN (
        SELECT company_id FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );

-- Staff/Manager/Supervisor: read documents for published policies in their company
CREATE POLICY "staff_view_policy_documents"
  ON public.policy_documents
  FOR SELECT
  USING (
    policy_id IN (
      SELECT id FROM public.policies
      WHERE is_published = true
        AND company_id IN (
          SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
        )
    )
  );


-- 2. POLICY_VERSIONS — snapshot of each previous version
CREATE TABLE IF NOT EXISTS public.policy_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id   uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  documents   jsonb NOT NULL DEFAULT '[]',
  changed_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(policy_id, version)
);

ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;

-- Admin: read version history for their company's policies
CREATE POLICY "admin_read_policy_versions"
  ON public.policy_versions
  FOR ALL
  USING (
    policy_id IN (
      SELECT id FROM public.policies
      WHERE company_id IN (
        SELECT company_id FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );


-- 3. Storage bucket for policy documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'policy-documents',
  'policy-documents',
  true,
  10485760, -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Admins can upload policy documents (scoped by company_id folder)
CREATE POLICY "admins_upload_policy_documents"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'policy-documents' AND
    (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can delete policy documents
CREATE POLICY "admins_delete_policy_documents"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'policy-documents' AND
    (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Anyone in the company can read policy documents
CREATE POLICY "users_read_policy_documents"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'policy-documents' AND
    (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );
