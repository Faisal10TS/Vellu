-- Belastingtarief niet meer standaard 21% voor elk land (23-09-2026).
-- Mebeauty.nails (Curaçao) kreeg bij het aanmelden OB 21%: het land ging mee,
-- de standaardwaarde van de kolom niet. Brilliant Beauty (Bonaire) idem: 21
-- i.p.v. 6. NULL betekent voortaan "landtarief": resolveTax (shared.jsx) valt
-- dan terug op TAX_RULES, en voor Curaçao (geen vastgesteld tarief) blijft het
-- leeg tot de eigenaar invult wat de boekhouder opgeeft. Een NL/BE-salon merkt
-- niets: NULL → 21 uit de landregel. De Instellingen schreven voor Curaçao al
-- NULL bij een leeg veld, wat tot nu op de NOT NULL-beperking stukliep.
alter table public.profiles alter column btw_rate drop not null;
alter table public.profiles alter column btw_rate drop default;
comment on column public.profiles.btw_rate is
  'Belastingtarief op behandelingen (%). NULL = landtarief uit TAX_RULES (shared.jsx, resolveTax). Curaçao heeft geen vastgesteld tarief en blijft leeg tot de eigenaar het invult. Nooit rechtstreeks lezen: altijd via resolveTax.';

-- Rijen die de oude standaard (21) kregen zonder dat de eigenaar er ooit naar
-- keek: buiten NL/BE, niet belastingplichtig gezet, nog op 21. Zelfde tarieven
-- als TAX_RULES: Bonaire 6, Saba/Sint Eustatius 4, Aruba 7, Sint Maarten 5,
-- Curaçao onbekend (NULL).
update public.profiles
   set btw_rate = case country_code
                    when 'BQ' then (case tax_region when 'BQ-SAB' then 4 when 'BQ-EUX' then 4 else 6 end)
                    when 'AW' then 7
                    when 'SX' then 5
                    else null
                  end
 where country_code not in ('NL', 'BE')
   and tax_registered = false
   and btw_rate = 21;
