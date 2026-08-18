CREATE OR REPLACE FUNCTION public.get_booked_slots_range(p_slug text, p_from date, p_to date, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(date date, "time" text, service_duration integer, staff_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.date, a.time, a.service_duration, a.staff_id
  FROM appointments a
  JOIN profiles p ON p.id = a.owner_id
  WHERE p.slug = p_slug
    AND a.date >= p_from AND a.date <= p_to
    AND (p_location_id IS NULL OR a.location_id IS NULL OR a.location_id = p_location_id)
    AND a.status IN ('confirmed', 'completed');
$function$;

GRANT EXECUTE ON FUNCTION public.get_booked_slots_range(text, date, date, uuid) TO anon, authenticated;