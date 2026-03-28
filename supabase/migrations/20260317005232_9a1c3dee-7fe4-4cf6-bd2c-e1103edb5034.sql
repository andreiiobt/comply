
-- 1. increment_xp function
CREATE OR REPLACE FUNCTION public.increment_xp(_user_id uuid, _xp int)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.profiles SET xp = xp + _xp WHERE user_id = _user_id;
$$;

-- 2. update_streak function
CREATE OR REPLACE FUNCTION public.update_streak(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _streak int := 0;
  _longest int;
BEGIN
  WITH ordered AS (
    SELECT activity_date, 
           CURRENT_DATE - activity_date AS days_ago
    FROM public.streaks 
    WHERE user_id = _user_id
    ORDER BY activity_date DESC
  ),
  consecutive AS (
    SELECT activity_date, days_ago,
           days_ago - (ROW_NUMBER() OVER (ORDER BY activity_date DESC))::int + 1 AS grp
    FROM ordered
    WHERE days_ago >= 0
  )
  SELECT count(*) INTO _streak
  FROM consecutive
  WHERE grp = (SELECT MIN(grp) FROM consecutive WHERE days_ago <= 1);

  SELECT longest_streak INTO _longest FROM public.profiles WHERE user_id = _user_id;
  
  UPDATE public.profiles 
  SET current_streak = COALESCE(_streak, 0),
      longest_streak = GREATEST(COALESCE(_longest, 0), COALESCE(_streak, 0))
  WHERE user_id = _user_id;
END;
$$;

-- 3. Add enforce_order column
ALTER TABLE public.learning_paths ADD COLUMN enforce_order boolean NOT NULL DEFAULT true;

-- 4. Unique constraint on user_progress
ALTER TABLE public.user_progress ADD CONSTRAINT user_progress_user_lesson_unique UNIQUE (user_id, lesson_id);

-- 5. Unique constraint on streaks for upsert
ALTER TABLE public.streaks ADD CONSTRAINT streaks_user_date_unique UNIQUE (user_id, activity_date);
