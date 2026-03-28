
-- Create enums
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff');
CREATE TYPE public.content_block_type AS ENUM ('section', 'card', 'question');
CREATE TYPE public.question_type AS ENUM ('multiple_choice', 'true_false', 'free_text');

-- Timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Companies table (white-label config)
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#58CC02',
  secondary_color TEXT NOT NULL DEFAULT '#1CB0F6',
  accent_color TEXT NOT NULL DEFAULT '#FFC800',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Locations table
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  full_name TEXT,
  avatar_url TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User roles table (separate from profiles per security guidelines)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  sub_role TEXT,
  UNIQUE (user_id, role, company_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get user's company
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Learning paths
CREATE TABLE public.learning_paths (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'book',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_learning_paths_updated_at BEFORE UPDATE ON public.learning_paths FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Courses
CREATE TABLE public.courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  learning_path_id UUID NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lessons
CREATE TABLE public.lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  xp_reward INTEGER NOT NULL DEFAULT 10,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lesson content blocks
CREATE TABLE public.lesson_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  block_type content_block_type NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  content TEXT,
  question_type question_type,
  options JSONB,
  correct_answer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lesson_content ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_lesson_content_updated_at BEFORE UPDATE ON public.lesson_content FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User progress
CREATE TABLE public.user_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT false,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- Streaks
CREATE TABLE public.streaks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_date)
);
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS POLICIES

-- Companies
CREATE POLICY "Users can view their company" ON public.companies
  FOR SELECT TO authenticated
  USING (id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins can update their company" ON public.companies
  FOR UPDATE TO authenticated
  USING (id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Locations
CREATE POLICY "Users can view locations in their company" ON public.locations
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins can insert locations" ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update locations" ON public.locations
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete locations" ON public.locations
  FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view company profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view company profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- User roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view company roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Learning paths
CREATE POLICY "Users can view published learning paths" ON public.learning_paths
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND (is_published = true OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Admins can insert learning paths" ON public.learning_paths
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update learning paths" ON public.learning_paths
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete learning paths" ON public.learning_paths
  FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Courses
CREATE POLICY "Users can view published courses" ON public.courses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.learning_paths lp 
    WHERE lp.id = learning_path_id 
    AND lp.company_id = public.get_user_company_id(auth.uid())
    AND (lp.is_published = true OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Admins can insert courses" ON public.courses
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.learning_paths lp 
    WHERE lp.id = learning_path_id 
    AND lp.company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  ));

CREATE POLICY "Admins can update courses" ON public.courses
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.learning_paths lp 
    WHERE lp.id = learning_path_id 
    AND lp.company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  ));

CREATE POLICY "Admins can delete courses" ON public.courses
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.learning_paths lp 
    WHERE lp.id = learning_path_id 
    AND lp.company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  ));

-- Lessons
CREATE POLICY "Users can view published lessons" ON public.lessons
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses c 
    JOIN public.learning_paths lp ON lp.id = c.learning_path_id
    WHERE c.id = course_id
    AND lp.company_id = public.get_user_company_id(auth.uid())
    AND (lp.is_published = true OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Admins can insert lessons" ON public.lessons
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.courses c 
    JOIN public.learning_paths lp ON lp.id = c.learning_path_id
    WHERE c.id = course_id
    AND lp.company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  ));

CREATE POLICY "Admins can update lessons" ON public.lessons
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses c 
    JOIN public.learning_paths lp ON lp.id = c.learning_path_id
    WHERE c.id = course_id
    AND lp.company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  ));

CREATE POLICY "Admins can delete lessons" ON public.lessons
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses c 
    JOIN public.learning_paths lp ON lp.id = c.learning_path_id
    WHERE c.id = course_id
    AND lp.company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  ));

-- Lesson content
CREATE POLICY "Users can view lesson content" ON public.lesson_content
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.courses c ON c.id = l.course_id
    JOIN public.learning_paths lp ON lp.id = c.learning_path_id
    WHERE l.id = lesson_id
    AND lp.company_id = public.get_user_company_id(auth.uid())
  ));

CREATE POLICY "Admins can insert lesson content" ON public.lesson_content
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.courses c ON c.id = l.course_id
    JOIN public.learning_paths lp ON lp.id = c.learning_path_id
    WHERE l.id = lesson_id
    AND lp.company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  ));

CREATE POLICY "Admins can update lesson content" ON public.lesson_content
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.courses c ON c.id = l.course_id
    JOIN public.learning_paths lp ON lp.id = c.learning_path_id
    WHERE l.id = lesson_id
    AND lp.company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  ));

CREATE POLICY "Admins can delete lesson content" ON public.lesson_content
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.courses c ON c.id = l.course_id
    JOIN public.learning_paths lp ON lp.id = c.learning_path_id
    WHERE l.id = lesson_id
    AND lp.company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  ));

-- User progress
CREATE POLICY "Users can view own progress" ON public.user_progress
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own progress" ON public.user_progress
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own progress" ON public.user_progress
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view company progress" ON public.user_progress
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view company progress" ON public.user_progress
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

-- Streaks
CREATE POLICY "Users can view own streaks" ON public.streaks
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own streaks" ON public.streaks
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
