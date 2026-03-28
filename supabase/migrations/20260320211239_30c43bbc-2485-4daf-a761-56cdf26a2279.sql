
-- badges table
CREATE TABLE public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  badge_type text NOT NULL DEFAULT 'emoji',
  emoji text,
  image_url text,
  trigger_type text NOT NULL DEFAULT 'learning_path',
  trigger_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company badges" ON public.badges
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can insert badges" ON public.badges
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update badges" ON public.badges
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete badges" ON public.badges
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- user_badges table
CREATE TABLE public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own badges" ON public.user_badges
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view company user badges" ON public.user_badges
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.badges b
    WHERE b.id = user_badges.badge_id
      AND b.company_id = get_user_company_id(auth.uid())
      AND has_role(auth.uid(), 'admin')
  ));

-- Award badge function for learning path completion
CREATE OR REPLACE FUNCTION public.award_path_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _badge RECORD;
  _path_id uuid;
  _all_done boolean;
BEGIN
  IF NEW.completed = true THEN
    -- Get learning path for this lesson
    SELECT lp.id INTO _path_id
    FROM lessons l
    JOIN courses c ON c.id = l.course_id
    JOIN learning_paths lp ON lp.id = c.learning_path_id
    WHERE l.id = NEW.lesson_id;

    IF _path_id IS NOT NULL THEN
      -- Check if all published lessons in path are completed
      SELECT NOT EXISTS (
        SELECT 1 FROM lessons l
        JOIN courses c ON c.id = l.course_id
        WHERE c.learning_path_id = _path_id
          AND l.is_published = true
          AND NOT EXISTS (
            SELECT 1 FROM user_progress up
            WHERE up.user_id = NEW.user_id AND up.lesson_id = l.id AND up.completed = true
          )
      ) INTO _all_done;

      IF _all_done THEN
        FOR _badge IN
          SELECT id FROM badges WHERE trigger_type = 'learning_path' AND trigger_id = _path_id
        LOOP
          INSERT INTO user_badges (user_id, badge_id)
          VALUES (NEW.user_id, _badge.id)
          ON CONFLICT (user_id, badge_id) DO NOTHING;
        END LOOP;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_award_path_badge
  AFTER INSERT OR UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION public.award_path_badge();

-- Award badge function for session attendance
CREATE OR REPLACE FUNCTION public.award_session_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _badge RECORD;
BEGIN
  IF NEW.attended = true AND (OLD IS NULL OR OLD.attended = false) THEN
    FOR _badge IN
      SELECT id FROM badges WHERE trigger_type = 'session' AND trigger_id = NEW.session_id
    LOOP
      INSERT INTO user_badges (user_id, badge_id)
      VALUES (NEW.user_id, _badge.id)
      ON CONFLICT (user_id, badge_id) DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_award_session_badge
  AFTER INSERT OR UPDATE ON public.f2f_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.award_session_badge();
