
-- Leaderboard function: returns top learners in user's company with location
CREATE OR REPLACE FUNCTION public.get_company_leaderboard(_user_id uuid, _limit int DEFAULT 50)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  avatar_url text,
  xp int,
  current_streak int,
  longest_streak int,
  location_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    p.user_id,
    p.full_name,
    p.avatar_url,
    p.xp,
    p.current_streak,
    p.longest_streak,
    l.name as location_name
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
  LEFT JOIN public.locations l ON l.id = ur.location_id
  WHERE p.company_id = get_user_company_id(_user_id)
  ORDER BY p.xp DESC
  LIMIT _limit;
$$;
