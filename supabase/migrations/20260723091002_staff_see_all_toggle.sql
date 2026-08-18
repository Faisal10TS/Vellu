-- Owner-controlled: when true, team members' staff app shows the WHOLE
-- salon agenda (with an Everyone/<staff> filter), not just their own
-- appointments. Default false keeps every existing salon's current
-- privacy behaviour (each stylist sees only their own clients).
alter table public.profiles add column if not exists staff_see_all boolean not null default false;