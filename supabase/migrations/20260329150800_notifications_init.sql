-- ================================================================
-- NOTIFICATIONS: System for rejections and expiries
-- ================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title           text NOT NULL,
  message         text NOT NULL,
  type            text NOT NULL DEFAULT 'info' 
                  CHECK (type IN ('info', 'success', 'warning', 'error')),
  link            text, -- Optional deep link
  status          text NOT NULL DEFAULT 'unread'
                  CHECK (status IN ('unread', 'read')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see/read their own notifications
CREATE POLICY "users_view_own_notifications"
  ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users_update_own_notifications"
  ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
  
-- Admins/System can insert notifications for any user in their company
CREATE POLICY "admin_insert_notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_roles 
      WHERE user_id = auth.uid() AND (role = 'admin' OR role = 'manager')
    )
  );

-- Indexes for performance
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_status ON public.notifications(status);
