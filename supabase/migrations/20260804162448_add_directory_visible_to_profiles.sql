ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS directory_visible boolean NOT NULL DEFAULT true;
-- Demo-salon niet tonen in de publieke salon-zoeker
UPDATE public.profiles SET directory_visible = false WHERE slug = 'bloomstudio';