-- Inrichtwizard: onthouden dat een salon hem heeft doorlopen of overgeslagen.
--
-- De wizard verscheen zolang een salon 0 diensten had. Wie de dienst-stap
-- oversloeg ("Later instellen") kreeg hem dus bij elke verversing opnieuw, en
-- begon weer bij het e-mailadres dat al was opgeslagen (Faisal, 21-09-2026,
-- testsalon met 762 geïmporteerde producten en nog geen diensten).
--
-- Op het account en niet in localStorage: een eigenaar logt in op telefoon én
-- laptop, en in een incognitovenster bestaat localStorage niet lang.
-- Geen backfill: salons met diensten zien de wizard toch al nooit; een salon
-- zonder diensten ziet hem nog één keer en daarna niet meer.
alter table public.profiles
  add column if not exists onboarding_done_at timestamptz;

comment on column public.profiles.onboarding_done_at is
  'Moment waarop de eigenaar de inrichtwizard afrondde of oversloeg. Gevuld = wizard nooit meer tonen, ook niet bij 0 diensten.';
