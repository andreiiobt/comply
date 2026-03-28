
-- Add passing_score column to lessons
ALTER TABLE public.lessons ADD COLUMN passing_score integer DEFAULT NULL;

-- Create quiz_attempts table
CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add unique constraint for user_progress upsert
-- (already exists via onConflict usage, skip if present)

-- Enable RLS
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

-- Users can insert own attempts
CREATE POLICY "Users can insert own attempts"
ON public.quiz_attempts FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can view own attempts
CREATE POLICY "Users can view own attempts"
ON public.quiz_attempts FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Admins can view company attempts
CREATE POLICY "Admins can view company attempts"
ON public.quiz_attempts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM lessons l
    JOIN courses c ON c.id = l.course_id
    JOIN learning_paths lp ON lp.id = c.learning_path_id
    WHERE l.id = quiz_attempts.lesson_id
    AND lp.company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Managers can view company attempts
CREATE POLICY "Managers can view company attempts"
ON public.quiz_attempts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM lessons l
    JOIN courses c ON c.id = l.course_id
    JOIN learning_paths lp ON lp.id = c.learning_path_id
    WHERE l.id = quiz_attempts.lesson_id
    AND lp.company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'manager'::app_role)
  )
);
