
-- Setup completed flag (single-row table)
CREATE TABLE public.setup_completed (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz
);

INSERT INTO public.setup_completed (id, completed) VALUES (1, false);

ALTER TABLE public.setup_completed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can check setup status"
  ON public.setup_completed FOR SELECT
  TO anon, authenticated
  USING (true);

-- Invitations table
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text,
  role app_role NOT NULL DEFAULT 'staff',
  location_id uuid REFERENCES public.locations(id),
  invite_code text NOT NULL UNIQUE,
  invite_type text NOT NULL DEFAULT 'code' CHECK (invite_type IN ('email', 'code')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_by uuid
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Admins can manage invitations for their company
CREATE POLICY "Admins can view company invitations"
  ON public.invitations FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create invitations"
  ON public.invitations FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update invitations"
  ON public.invitations FOR UPDATE
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete invitations"
  ON public.invitations FOR DELETE
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- Anyone can look up an invite by code (for redemption)
CREATE POLICY "Anyone can view invite by code"
  ON public.invitations FOR SELECT
  TO anon, authenticated
  USING (status = 'pending' AND expires_at > now());
