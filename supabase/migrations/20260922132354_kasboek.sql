-- Kasboek (Faisal 22-09-2026, na kassa in/kassa uit bij contant afrekenen):
-- de kassalade zelf. Per dag: een beginsaldo (het wisselgeld waarmee de dag
-- start), handmatige stortingen (kas in) en opnames (kas uit) met een reden,
-- en aan het eind een telling. De contante verkopen zelf staan al op
-- appointments (payment_method = 'cash') en worden erbij opgeteld:
--   verwacht in kas = beginsaldo + contante verkopen + kas in - kas uit.
-- Bij een telling wordt het op dat moment verwachte bedrag mee opgeslagen
-- (expected), zodat het kasverschil van die dag vast blijft staan ook als er
-- later nog een verkoop van die dag wordt verwijderd.
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('open', 'in', 'out', 'count')),
  amount numeric(10,2) not null check (amount >= 0),
  reason text,
  expected numeric(10,2),
  staff_name text,
  created_at timestamptz not null default now()
);
comment on table public.cash_movements is 'Kasboek van de kassalade: beginsaldo (open), storting (in), opname (out) en telling (count) per dag. Contante verkopen staan op appointments.';
comment on column public.cash_movements.expected is 'Alleen bij kind = count: het verwachte kasbedrag op het moment van tellen; kasverschil = amount - expected.';

create index cash_movements_owner_date_idx on public.cash_movements (owner_id, date, created_at);

alter table public.cash_movements enable row level security;
create policy owner_manages_cash_movements on public.cash_movements
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.cash_movements to authenticated;
