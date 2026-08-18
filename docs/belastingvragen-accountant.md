# Vragen voor de accountant — belastingtarieven per eiland

Vellu rekent belasting per land/eiland uit in één centrale motor
(`src/shared.jsx` → `TAX_RULES`, doorgerekend in `src/taxEngine.js`). Wat daarin
staat is deels gecontroleerd en deels een aanname. Dit stuk zet per punt neer
**wat de app nu doet**, **waar dat vandaan komt** en **wat je precies moet
vragen** — zodat je het in één gesprek kunt afhandelen.

De regel voor jezelf: alles hieronder raakt bedragen op klantfacturen. Zolang
een punt open staat, staat er een tarief in dat aannemelijk is maar niet
bevestigd.

---

## 1. Bonaire — producten niet belast? (het meest urgent)

**Wat de app doet:** ABB 6% op *diensten*, en **geen** ABB op doorverkochte
*producten* (`productsTaxable: false`).

**Waarom dat er staat:** op de BES-eilanden drukt de ABB bij invoer of productie,
niet bij elke doorverkoop. Een salon die shampoo inkoopt en doorverkoopt zou dan
niet nog eens ABB moeten heffen.

**Wat je vraagt:**
> Klopt het dat een salon op Bonaire wél ABB rekent over behandelingen, maar
> niet over producten die zij inkoopt en doorverkoopt? En zo ja: geldt dat
> ongeacht of de leverancier lokaal of buitenlands is?

**Waarom dit als eerste moet:** je hebt een actieve klant op Bonaire (My Whims
and More) en dit bepaalt het bedrag op elke bon met een product erop. Zit dit
verkeerd, dan moet het met terugwerkende kracht rechtgezet.

**Tarieven die de app hanteert:** Bonaire 6%, Saba 4%, Sint Eustatius 4%.
Laat ook die twee bevestigen als je er ooit een salon krijgt.

---

## 2. Curaçao — welk OB-tarief geldt voor salondiensten?

**Wat de app doet:** *niets invullen*. Het veld staat bewust leeg
(`serviceRate: null`, `rateUnknown: true`) met 6% als suggestie, en de app vraagt
de saloneigenaar het tarief zelf in te vullen.

**Waarom:** het algemene OB-tarief is 6%, maar er bestaan ook 0%, 7% en 9%, en
het is niet vastgesteld waar kappers- en beautydiensten onder vallen.

**Wat je vraagt:**
> Onder welk OB-tarief vallen kappers- en schoonheidsbehandelingen op Curaçao?
> En geldt voor de doorverkoop van verzorgingsproducten hetzelfde tarief?

**Zolang dit open staat** blijft de huidige oplossing goed: de eigenaar vult het
zelf in. Niet zelf een tarief invullen dat je niet zeker weet.

---

## 3. Sint Maarten — is ToT 5% juist, en hoort het van de bon af?

**Wat de app doet:** ToT 5% over diensten én producten, en het bedrag komt
**niet** op de klantfactuur (`showTaxLine: false`) — dezelfde weergaveregel als
Aruba.

**Waarom:** ToT drukt op de omzet van de ondernemer, niet op de klant; prijzen
zijn inclusief.

**Wat je vraagt:**
> Is het ToT-tarief voor een salon op Sint Maarten 5%? En mag of moet het bedrag
> van de klantfactuur worden weggelaten, zoals bij de Arubaanse BBO?

**Urgentie:** laag — je hebt nog geen salon op Sint Maarten. Doen vóór de eerste.

---

## 4. Aruba — bevestiging van de samengevoegde 7%

**Wat de app doet:** 7% over diensten en producten, bedrag **niet** op de
klantfactuur.

**Waarom:** BBO 2,5% + BAVP 1,5% + BAZV 3% zijn per 1 januari 2023 samengevoegd,
en sinds 1 januari 2019 mag het bedrag niet apart op de factuur staan.

**Wat je vraagt:**
> Is 7% nog steeds het gecombineerde tarief, en klopt het dat het bedrag niet
> apart op de klantfactuur mag?

**Urgentie:** laag — dit is het best onderbouwde punt van de vier. Meenemen als
controle.

---

## 5. Los daarvan: factuur VEL-2026-0003

Staat al langer open en gaat niet over tarieven maar over je eigen
administratie: **moet daar een creditnota bij?** Neem hem mee in hetzelfde
gesprek.

---

## Wat je daarna doet

Elke bevestiging of correctie gaat naar `TAX_RULES` in `src/shared.jsx`. Draai
daarna altijd:

```bash
node scripts/tax-engine-check.mjs
```

Dat zijn 62 controles over de rekenmotor; die moeten allemaal slagen voordat er
iets live gaat. Zet in de commit-boodschap wie het bevestigd heeft en wanneer —
dan hoeft niemand deze vragen ooit nog een tweede keer te stellen.
