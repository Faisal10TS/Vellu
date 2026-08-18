-- The previous version only skipped profile-creation when a staff_members row
-- already had user_id = NEW.id. In practice the invite edge function CREATES
-- the auth user first (which fires this trigger) and only then updates
-- staff_members.user_id, so the check would always miss and every staff
-- signup ended up with a ghost owner profile. Also check by email so an
-- invited staff row (email set, user_id still null) blocks the profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id = NEW.id
       OR (email IS NOT NULL AND NEW.email IS NOT NULL AND lower(email) = lower(NEW.email))
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, email, business_name, slug, city)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'business_name', 'Mijn Salon'),
    COALESCE(NEW.raw_user_meta_data->>'slug', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'city', 'Nederland')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;