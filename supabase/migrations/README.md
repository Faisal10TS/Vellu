# Migraties

Deze map bevat de volledige schemageschiedenis van de productiedatabase
(project `pqvovkwqkapmpibktpwb`): **93 bestanden, één per rij in
`supabase_migrations.schema_migrations`**, met dezelfde versienummers.

## Waarom dit bestand er is

Tot 18 augustus 2026 stonden hier 11 bestanden tegenover 90 toegepaste
migraties. De overige 79 — alle tabellen, alle RLS-policies, alle functies,
triggers en indexen, dus praktisch het hele schema — bestonden alleen nog als
tekst in de productiedatabase. De database was daarmee niet herbouwbaar uit de
repo: bij verlies van het Supabase-project was het schema weg. Bovendien had
geen van die 11 bestanden hetzelfde versienummer als de migratie waar het bij
hoorde, waardoor een `supabase db push` ze allemaal opnieuw zou draaien.

Beide zijn rechtgezet. De 79 zijn teruggehaald uit de ledger, de 11 (plus de
vier van die dag zelf) zijn hernoemd naar hun echte versienummer.

## Twee soorten bestanden

**1. Teruggehaald uit de ledger (78 stuks).**
De inhoud is byte voor byte gelijk aan wat er in productie gedraaid heeft. Geen
toegevoegd commentaar, geen herformattering — juist omdat elke wijziging de
verifieerbaarheid zou breken. Sommige beginnen daardoor met een lege regel of
eindigen zonder newline; dat is precies zoals het in de database staat.

**2. Met de hand geschreven (15 stuks).**
Alles vanaf `20260813172120`. Die bevatten uitgebreid commentaar over het
waarom van de wijziging. Hun ruwe md5 wijkt daardoor per definitie af van de
ledger; de SQL erin is identiek (gecontroleerd door aan beide kanten
commentaar en witruimte weg te normaliseren).

Op één na. Zie hieronder.

## Bekende afwijking: 20260815220939_birthday_code_single_use.sql

Dit bestand bevat één statement méér dan de ledger-rij:

```sql
grant select on public.birthday_discount_codes to authenticated;
```

Die grant is destijds los uitgevoerd en nooit als migratie geregistreerd. Hij
staat wél in productie (gecontroleerd). **Het bestand is hier dus completer dan
de ledger en moet zo blijven** — zonder die regel levert een herbouw een dode
policy op: RLS-policies werken pas als de rol óók het gewone SELECT-privilege
heeft, en een eerdere migratie had dat met `revoke all` weggehaald. Gevolg zou
zijn dat een eigenaar zijn eigen verjaardagscodes niet kan inzien.

Dit is meteen de les: **voer schemawijzigingen altijd als migratie uit, nooit
als losse query.** Anders ontstaat er productie-toestand die in geen enkel
bestand staat, en die ontdek je pas bij een herstel.

## Controleren of bestanden en database nog synchroon lopen

```sql
-- Moet 93 = 93 geven, met nul aan beide "zonder"-kanten.
select count(*) as ledger_rijen from supabase_migrations.schema_migrations;

-- Per migratie de waarheid, om tegen de bestanden te leggen:
select version, name, md5(statements[1]) as md5, octet_length(statements[1]) as bytes,
       array_length(statements, 1) as aantal_statements
  from supabase_migrations.schema_migrations
 order by version;
```

`array_length` hoort overal 1 te zijn. Staat er meer, dan is `statements[1]`
maar een fragment en is het bijbehorende bestand onvolledig — ook als de md5
van dat fragment klopt.

Lokaal de md5 van een bestand:

```bash
node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('md5').update(f.readFileSync(process.argv[1])).digest('hex'))" supabase/migrations/<bestand>.sql
```

De regeleindes moeten LF blijven, anders klopt geen enkele md5 meer terwijl er
inhoudelijk niets veranderd is. Daarvoor staat `*.sql text eol=lf` in
`.gitattributes` — `core.autocrlf` staat op deze machine namelijk op `true`.

## Wat deze map NIET dekt

Een herbouw uit deze migraties levert het schema op, maar niet alles wat
Vellu draaiende houdt. Buiten de migraties vallen:

- **3 storage-buckets** (`business-images` en `service-photos` publiek,
  `db-backups` privé — die laatste moet privé blijven, er staan
  klantgegevens en tokens in) en de **9 policies op `storage.objects`**
- **5 pg_cron-jobs** (reminders, followups, rebook-nudge, db-backup,
  cron-watchdog), inclusief de `pg_net`-extensie waar ze op leunen
- **edge functions** — die staan in `supabase/functions/`, met hun
  `verify_jwt`-instelling in `supabase/config.toml`
- **secrets** (`RESEND_API_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`,
  Mollie-sleutels, `ADMIN_ALERT_EMAIL`)

## Nooit gedaan: een echte herstel-test

Er is nooit een backup teruggezet en nooit een herbouw uit deze migraties
gedraaid. Dat deze 93 bestanden samen het schema opleveren, is aangetoond
doordat ze gelijk zijn aan wat er is gedraaid — niet doordat het opnieuw
gedraaid is. Dat verschil is echt. Een herstel-test hoort op een apart,
leeg project of een Supabase-branch, nooit op productie.
