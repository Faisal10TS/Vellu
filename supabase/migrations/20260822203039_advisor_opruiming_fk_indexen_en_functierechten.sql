-- Advisor-opruiming 2026-08-22 (Supabase security + performance advisors).
--
-- 1) 23 foreign keys zonder dekkende index ("unindexed_foreign_keys").
--    Goedkoop, en het scheelt bij joins en bij ON DELETE CASCADE-controles.
create index if not exists idx_appointments_client_id        on public.appointments (client_id);
create index if not exists idx_appointments_location_id      on public.appointments (location_id);
create index if not exists idx_appointments_service_id       on public.appointments (service_id);
create index if not exists idx_cancellation_tokens_appt_id   on public.cancellation_tokens (appointment_id);
create index if not exists idx_client_tokens_client_id       on public.client_tokens (client_id);
create index if not exists idx_location_services_service_id  on public.location_services (service_id);
create index if not exists idx_location_staff_staff_id       on public.location_staff (staff_id);
create index if not exists idx_locations_owner_id            on public.locations (owner_id);
create index if not exists idx_payment_invoices_event_id     on public.payment_invoices (payment_event_id);
create index if not exists idx_payments_subscription_id      on public.payments (subscription_id);
create index if not exists idx_profiles_referred_by          on public.profiles (referred_by);
create index if not exists idx_reviews_appointment_id        on public.reviews (appointment_id);
create index if not exists idx_reviews_owner_id              on public.reviews (owner_id);
create index if not exists idx_service_categories_owner_id   on public.service_categories (owner_id);
create index if not exists idx_service_extras_service_id     on public.service_extras (service_id);
create index if not exists idx_service_photos_owner_id       on public.service_photos (owner_id);
create index if not exists idx_service_photos_service_id     on public.service_photos (service_id);
create index if not exists idx_service_variants_service_id   on public.service_variants (service_id);
create index if not exists idx_services_category_id          on public.services (category_id);
create index if not exists idx_services_owner_id             on public.services (owner_id);
create index if not exists idx_staff_members_owner_id        on public.staff_members (owner_id);
create index if not exists idx_staff_services_service_id     on public.staff_services (service_id);
create index if not exists idx_waitlist_staff_id             on public.waitlist (staff_id);

-- 2) SECURITY DEFINER-functies die via /rest/v1/rpc aanroepbaar waren door anon
--    ("anon_security_definer_function_executable"). Rechten zijn optelbaar:
--    PUBLIC intrekken is nodig, anders erft anon het alsnog.
--    - Triggerfuncties: nooit bedoeld om direct aan te roepen. Een trigger vuurt
--      ook zónder EXECUTE-recht van de aanroeper (getest in een teruggedraaide
--      transactie: status → no_show als authenticated, trigger liep). Voor
--      handle_new_user (AFTER INSERT ON auth.users) krijgt supabase_auth_admin
--      toch expliciet EXECUTE — signup mag hier nooit van afhangen.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant  execute on function public.handle_new_user() to supabase_auth_admin, service_role;
revoke execute on function public.tg_appointments_count_no_show() from public, anon, authenticated;
grant  execute on function public.tg_appointments_count_no_show() to service_role;
--    - record_no_show / increment_no_show_count controleren zelf auth.uid() en
--      kunnen door anon dus nooit slagen; de aanroepbaarheid was alleen ruis.
revoke execute on function public.record_no_show(uuid, text) from public, anon;
grant  execute on function public.record_no_show(uuid, text) to authenticated, service_role;
revoke execute on function public.increment_no_show_count(uuid) from public, anon;
grant  execute on function public.increment_no_show_count(uuid) to authenticated, service_role;
--    Bewust NIET aangeraakt: get_booked_slots(_range), validate_birthday_discount,
--    submit_review (publieke boekings-/reviewflow), is_admin (wordt vóór login
--    bevraagd), de admin_*-RPC's (controleren is_admin() intern) en de
--    SECURITY DEFINER-views public_salons/public_staff/public_reviews (bewuste
--    kolom-whitelist, schrijfrechten al ingetrokken op 18-08).
