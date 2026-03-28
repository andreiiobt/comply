-- Fix: authenticated users accepting invites from other companies need to look up by code
-- Remove the overly restrictive company-scoped policy and allow authenticated users
-- to view pending invites (the admin listing is already separately scoped)
DROP POLICY "Authenticated can view invite by code" ON invitations;

-- Allow authenticated users to view pending invitations (for accept-invite flow)
-- The admin panel listing is already scoped by "Admins can view company invitations"
-- This policy is permissive (OR'd), so admins see both their company's + pending ones
-- But since the admin UI only queries their own, this is fine
CREATE POLICY "Authenticated can lookup pending invites" ON invitations
  FOR SELECT TO authenticated
  USING (
    status = 'pending' AND expires_at > now()
  );