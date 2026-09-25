-- Klantenrekening: verkopen en afspraken "op rekening", deelbetalingen en
-- zakelijke klanten (My Whims and More, 25-09-2026: "tin e posibilidat ku ora
-- un hende ta paga despues mi por pone den standby? Dus credit?" — haar oude
-- Sara Salon had een lijst "te ontvangen" per klant met totaal en ouderdom).
--
-- client_payments: elke ontvangen (deel)betaling op een open post. De app
-- houdt appointments.amount_paid en paid_at zelf bij (som van de betalingen,
-- plus een eventuele vooruitbetaling); deze tabel is het logboek én de bron
-- voor het kasboek: contant geld telt op de dag van ontvangst, niet op de dag
-- van de verkoop.
create table public.client_payments (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  amount         numeric(10,2) not null check (amount > 0),
  method         text not null default 'cash' check (method in ('cash', 'pin', 'transfer', 'online')),
  paid_on        date not null default current_date,
  note           text,
  staff_name     text,
  created_at     timestamptz not null default now()
);
comment on table public.client_payments is 'Ontvangen (deel)betalingen op open posten: verkopen op rekening en afspraken "later / factuur". Bron voor het kasboek op de ontvangstdag.';
create index client_payments_owner_paid_on_idx on public.client_payments (owner_id, paid_on);
create index client_payments_appointment_idx on public.client_payments (appointment_id);
alter table public.client_payments enable row level security;
create policy "owner manages own client payments" on public.client_payments
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
revoke all on public.client_payments from anon;
grant select, insert, update, delete on public.client_payments to authenticated;

-- Zakelijke klanten met een eigen rekening (school, supermarkt): vlag en
-- contactpersoon op de handmatige klantenlijst; naam = bedrijfsnaam.
alter table public.manual_clients
  add column is_business boolean not null default false,
  add column contact_name text;
comment on column public.manual_clients.is_business is 'Zakelijke klant (bedrijf of instelling) met een eigen rekening; name is dan de bedrijfsnaam.';
comment on column public.manual_clients.contact_name is 'Contactpersoon bij een zakelijke klant.';
