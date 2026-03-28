
-- Add slug column to companies
ALTER TABLE public.companies ADD COLUMN slug text UNIQUE;

-- Create index for fast slug lookups
CREATE INDEX idx_companies_slug ON public.companies(slug);

-- Function to get company by slug (security definer bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_company_by_slug(_slug text)
RETURNS SETOF public.companies
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.companies WHERE slug = _slug LIMIT 1;
$$;

-- Allow anon users to call the function (for login page branding)
GRANT EXECUTE ON FUNCTION public.get_company_by_slug(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_company_by_slug(text) TO authenticated;
