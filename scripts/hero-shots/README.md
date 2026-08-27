# Hero-telefoonschermen verversen

De zeven `public/hero-phone-1..7.jpg` op de landing zijn echte captures van de
Bloom Studio-demosalon (login `demo@bloomstudio.example`). Zo maak je ze opnieuw
(bijv. na een UI-wijziging of als de demo-data verlopen oogt):

1. **Reseed de demo-data** (idempotent, relatief aan vandaag):
   draai `reseed.sql` tegen productie (Supabase SQL editor of MCP).

2. **Vang de schermen** — vanuit een werkmap (niet in de repo):

   ```
   npm i puppeteer-core sharp
   set SB_KEY=<service_role key>   # via: npx supabase projects api-keys --project-ref pqvovkwqkapmpibktpwb
   node capture.mjs                # logt in via magic link, 7 shots + statusbalk-PNG's in ./raw
   node compose.mjs                # statusbalk erboven + 762x1652 JPEG q88 naar ../../public (pad in script checken!)
   ```

   `capture.mjs` verwacht Chrome op `C:\Program Files\Google\Chrome\Application\chrome.exe`
   en `compose.mjs` schrijft absoluut naar `C:\Users\faisa\vellu\public` — pas aan waar nodig.

3. **QA + ship**: bekijk alle zeven, dan committen en pushen (bestaande paden,
   dus geen SRC/-case-valkuil).

Shotlijst: 1 dashboard · 2 agenda (week) · 3 klanten · 4 analytics · 5 facturen ·
6 boekingspagina diensten · 7 boekingspagina contact/kaart.

Details die in de scripts zitten en die je anders vergeet:

- Magic link landt op `vellu.cc/`; de owner-app leeft op **`/owner`** — het
  script navigeert daar expliciet heen nadat supabase-js de sessie heeft gezet.
- localStorage-presets vóór load: `vellu_lang=en`, `vellu-theme=light` (default
  is dark!), `vellu_cookies_accepted=true`, `vellu_install_dismissed=true`
  (PWA-banner) en `vellu_tour_v1_<salon-id>=1` (rondleiding).
- Viewport is 390×797 @3x; de ontbrekende 47px is de iOS-statusbalk die
  `compose.mjs` erboven plakt (achtergrondkleur gesampled per shot).
- Op de boekingspagina verbergt het script de zwevende BOOK-pil alleen voor
  shot 6 (valt daar precies over een inline BOOK-knop).
