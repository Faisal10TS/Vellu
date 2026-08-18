-- Drag-reorder for service extras (variants already have position).
-- Backfill preserves today's visual order (created_at) per service.
alter table public.service_extras add column if not exists position integer default 0;
with ranked as (
  select id, row_number() over (partition by service_id order by created_at, id) - 1 as rn
  from public.service_extras
)
update public.service_extras e set position = ranked.rn
from ranked where ranked.id = e.id;