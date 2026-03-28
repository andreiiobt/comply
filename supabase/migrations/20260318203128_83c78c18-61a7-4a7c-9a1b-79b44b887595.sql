
-- Clear all data in correct order (respecting foreign keys)
TRUNCATE public.checklist_submissions CASCADE;
TRUNCATE public.user_progress CASCADE;
TRUNCATE public.streaks CASCADE;
TRUNCATE public.f2f_enrollments CASCADE;
TRUNCATE public.f2f_sessions CASCADE;
TRUNCATE public.lesson_content CASCADE;
TRUNCATE public.lessons CASCADE;
TRUNCATE public.courses CASCADE;
TRUNCATE public.path_assignments CASCADE;
TRUNCATE public.learning_paths CASCADE;
TRUNCATE public.user_custom_roles CASCADE;
TRUNCATE public.custom_roles CASCADE;
TRUNCATE public.invitations CASCADE;
TRUNCATE public.user_roles CASCADE;
TRUNCATE public.profiles CASCADE;
TRUNCATE public.locations CASCADE;
TRUNCATE public.companies CASCADE;
TRUNCATE public.setup_completed CASCADE;

-- Re-insert the setup_completed row so the setup flow works
INSERT INTO public.setup_completed (id, completed) VALUES (1, false);

-- Delete all auth users via cascade (profiles already truncated)
DELETE FROM auth.users;
