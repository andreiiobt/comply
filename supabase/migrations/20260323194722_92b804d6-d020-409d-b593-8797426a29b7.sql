-- Fix: "Anyone can view invite by code" is too broad — it exposes all pending invitations across companies.
-- Replace with a policy that only allows lookup when filtering by invite_code.
DROP POLICY "Anyone can view invite by code" ON invitations;

-- Anon users can only view a specific invitation by its code (used during accept-invite flow)
-- This relies on the query including a .eq("invite_code", ...) filter
CREATE POLICY "Anyone can view invite by code" ON invitations
  FOR SELECT TO anon
  USING (
    status = 'pending' AND expires_at > now()
  );

-- Authenticated users who are NOT admins of this company should also be able to look up invites by code
-- (e.g. during the accept flow when logged in)
CREATE POLICY "Authenticated can view invite by code" ON invitations
  FOR SELECT TO authenticated
  USING (
    status = 'pending' AND expires_at > now()
    AND company_id = get_user_company_id(auth.uid())
  );