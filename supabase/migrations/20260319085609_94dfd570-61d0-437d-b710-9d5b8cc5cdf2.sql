ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_profiles_fk
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id)
  ON DELETE CASCADE;