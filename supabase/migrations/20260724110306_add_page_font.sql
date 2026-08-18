alter table public.profiles
  add column if not exists page_font text not null default 'classic';

comment on column public.profiles.page_font is
  'Display/heading font style for the public booking page. Key into PAGE_FONTS in SRC/shared.jsx (classic|modern|elegant|bold|playful|handwriting). Body text stays Jost.';