
ALTER TYPE public.content_block_type ADD VALUE 'training_checklist';

CREATE TABLE public.checklist_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES public.lesson_content(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  checked_items jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, block_id)
);

ALTER TABLE public.checklist_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own submissions" ON public.checklist_submissions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own pending submissions" ON public.checklist_submissions FOR UPDATE TO authenticated USING (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "Users can view own submissions" ON public.checklist_submissions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins managers can view submissions" ON public.checklist_submissions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Admins managers can review submissions" ON public.checklist_submissions FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
