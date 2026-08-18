# Migraties

**95 bestanden ↔ 95 rijen in `supabase_migrations.schema_migrations`**, met
dezelfde versienummers. Van `20260101000000_baseline_pre_ledger_schema` tot
`20260818140001_reconcile_handmatige_wijzigingen`.

## Wat hier op 18 augustus 2026 is rechtgezet

**Ronde 1 — 79 migraties bestonden alleen in de database.**
De repo had 11 bestanden tegenover 90 toegepaste migraties. De overige 79
bestonden alleen als tekst in de ledger. Ze zijn teruggehaald en per stuk
md5-geverifieerd. Daarnaast had geen van die 11 bestanden het versienummer van
de migratie waar het bij hoorde, waardoor een `supabase db push` ze allemaal
opnieuw zou draaien; ze zijn hernoemd.

**Ronde 2 — het fundament stond in geen enkele migratie.**
Na ronde 1 leek de reeks compleet. Dat was hij niet. De ledger begint op
11 maart 2026, maar Vellu bestond al langer: het fundament is daarvóór met de
hand aangelegd en nooit vastgelegd. **17 van de 33 tabellen werden door geen
enkele migratie aangemaakt** — profiles, appointments, services, staff_members,
reviews en twaalf andere. De allereerste migratie (`20260311125516`) doet al
`references services(id)`, dus een herbouw op een lege database faalde niet
halverwege maar meteen bij migratie 1.

Een systematische vergelijking van productie tegen de migratiebestanden — per
tabel, kolom, functie, trigger, policy, index, constraint, grant, extensie en
storage-object, elke bevinding daarna nagerekend door een tweede partij die hem
probeerde te weerleggen — leverde 72 bevestigde gaten op. Die zijn opgevangen
door twee bestanden:

- `20260101000000_baseline_pre_ledger_schema.sql` — de 17 tabellen met hun
  sleutels, foreign keys, indexen, RLS en 30 policies.
- `20260818140001_reconcile_handmatige_wijzigingen.sql` — wat ná maart met een
  losse query is aangebracht: de trigger op `auth.users` (zonder die trigger
  krijgt een nieuwe gebruiker geen profiel), de referral-code-trigger,
  `is_admin()` plus vijf admin-functies, `get_booked_slots`, een uitgestelde
  foreign key en vier storage-policies.

## Drie soorten bestanden

**1. Teruggehaald uit de ledger (78).**
Byte voor byte gelijk aan wat er in productie gedraaid heeft. Geen toegevoegd
commentaar, geen herformattering — elke wijziging zou de verifieerbaarheid
breken. Sommige beginnen daardoor met een lege regel of eindigen zonder
newline; zo staat het in de database.

**2. Met de hand geschreven (15).**
Alles van `20260813172120` tot en met `20260818122452`. Bevatten uitleg over het
waarom. Hun ruwe md5 wijkt daardoor af van de ledger; de SQL is wél
gecontroleerd door aan beide kanten commentaar en witruimte weg te normaliseren.
14 van de 15 zijn dan identiek — de vijftiende staat hieronder.

**3. Gegenereerd uit de catalogus (2).**
De basis en de verzoening. Samengesteld uit `pg_class`, `pg_attribute`,
`pg_constraint`, `pg_index`, `pg_policies` en `pg_proc`, waarna per onderdeel is
gecontroleerd of een latere migratie hem al aanmaakt. Wat al gedekt was is
weggelaten, zodat de historische volgorde blijft kloppen: 83 kolommen (51 op
profiles), vijf constraints, vier indexen en 16 van de 46 policies.

## Twee bekende afwijkingen, allebei bewust

**`20260815220939_birthday_code_single_use.sql`** bevat één statement méér dan
de ledger-rij:

```sql
grant select on public.birthday_discount_codes to authenticated;
```

Die grant is destijds los uitgevoerd en nooit als migratie geregistreerd, maar
staat wél in productie. **Het bestand is hier completer dan de ledger en moet zo
blijven** — zonder die regel levert een herbouw een dode policy op: RLS werkt
pas als de rol ook het gewone SELECT-privilege heeft, en een eerdere migratie
had dat met `revoke all` weggehaald. Een eigenaar zou zijn eigen
verjaardagscodes niet kunnen inzien. Dit was het spoor dat naar ronde 2 leidde.

**`20260101000000_baseline_pre_ledger_schema.sql`** is in productie
geregistreerd als toegepast zónder te zijn gedraaid. Het schema stond er immers
al; opnieuw draaien zou 30 policies even weggooien en opnieuw aanmaken, en dat
risico is op een live database nergens voor nodig. De ledger-rij bevat daarom
alleen een toelichting, niet de SQL. Het bestand is de echte inhoud.

## De les

**Voer schemawijzigingen altijd als migratie uit, nooit als losse query.**
Beide rondes hierboven komen daar op neer. Wat je met de hand aanbrengt werkt
prima — tot het moment dat je de database moet herbouwen, en dat is precies het
moment waarop je er niets meer aan kunt doen.

## Zelf controleren of bestanden en database synchroon lopen

```sql
select version, name, md5(statements[1]) as md5,
       octet_length(statements[1]) as bytes,
       array_length(statements, 1) as aantal_statements
  from supabase_migrations.schema_migrations
 order by version;
```

`array_length` hoort overal 1 te zijn. Staat er meer, dan is `statements[1]`
maar een fragment en is het bijbehorende bestand onvolledig — ook als de md5 van
dat fragment klopt.

Lokaal de md5 van een bestand:

```bash
node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('md5').update(f.readFileSync(process.argv[1])).digest('hex'))" supabase/migrations/<bestand>.sql
```

Regeleindes moeten LF blijven, anders klopt geen enkele md5 meer terwijl er
inhoudelijk niets veranderd is. Daarvoor staat `*.sql text eol=lf` in
`.gitattributes` — `core.autocrlf` staat op deze machine op `true`.

## Wat een herbouw NIET dekt

Deze migraties leveren het schema op, niet de hele omgeving. Buiten de
migraties vallen:

- **3 storage-buckets** — `business-images` en `service-photos` publiek,
  `db-backups` PRIVÉ (daar staan klantgegevens en tokens in; die mag nooit op
  publiek). De 9 policies op `storage.objects` staan er wél in.
- **5 pg_cron-jobs**. Hun opdracht bevat de anon-sleutel van het project en
  hoort dus niet in de repo. Het patroon en de vijf schema's staan onderaan
  `20260818140001_reconcile_handmatige_wijzigingen.sql`.
- **Edge functions** — `supabase/functions/`, met hun `verify_jwt` in
  `supabase/config.toml`.
- **Secrets** — `RESEND_API_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`,
  `ADMIN_ALERT_EMAIL`, de Mollie-sleutels, `SUPABASE_SERVICE_ROLE_KEY`.

## Wat nog niet is bewezen

**Er is nooit een herbouw gedraaid.** Dat deze 95 bestanden samen het schema
opleveren is afgeleid uit de catalogus en uit een sluitende vergelijking met
productie — niet aangetoond door ze uit te voeren. De verzoenings-migratie is
wél echt gedraaid (op productie, waar hij niets veranderde), dus daarvan staat
vast dat de SQL geldig is en compileert. Voor de basis geldt dat niet.

Datzelfde geldt voor de dagelijkse back-up: die is nooit teruggezet.

Een echte test hoort op een leeg tweede project of een Supabase-branch, nooit op
productie: schema uit deze migraties opbouwen, daarna het nieuwste
back-up-JSON uit de bucket `db-backups` inlezen, en dan kijken of de app erop
draait. Zolang dat niet gebeurd is, is herbouwbaarheid een goed onderbouwde
aanname en geen zekerheid.
