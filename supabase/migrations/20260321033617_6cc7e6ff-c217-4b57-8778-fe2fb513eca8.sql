
-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Create trigger function that calls sync-user-to-kotora via pg_net
CREATE OR REPLACE FUNCTION public.notify_kotora_user_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _payload jsonb;
  _supabase_url text;
BEGIN
  _supabase_url := current_setting('app.settings.supabase_url', true);
  
  -- If supabase_url not set via app.settings, construct from project ref
  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    _supabase_url := 'https://fdohkrirvlucorklufpk.supabase.co';
  END IF;

  _payload := jsonb_build_object(
    'type', TG_OP,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE row_to_json(NEW)::jsonb END,
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE row_to_json(OLD)::jsonb END
  );

  PERFORM extensions.http_post(
    url := _supabase_url || '/functions/v1/sync-user-to-kotora',
    body := _payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table
CREATE TRIGGER on_profile_change_sync_kotora
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_kotora_user_sync();
