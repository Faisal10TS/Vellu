import { useNavigate } from "react-router-dom";
import { useTheme, useSEO, ACCENT, T, Layout, NavIcon, LangToggle, ThemeToggle, Header } from "./shared.jsx";

function PrivacyPage({ lang, setLang }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const t = T[lang];
  useSEO({ title: lang === "nl" ? "Privacybeleid | Vellu" : "Privacy Policy | Vellu", url: "https://vellu.cc/privacy" });
  const content = lang === "nl" ? {
    title: "Privacybeleid",
    updated: "Laatst bijgewerkt: april 2026",
    sections: [
      ["Wie zijn wij?", "Vellu is een online boekingsplatform voor beautyprofessionals, kappers, nagelsalons, wimperspecialisten en andere persoonlijke-verzorgingsbedrijven. Vellu is een product van Mirah Ventures (eenmanszaak gevestigd te Amersfoort, ingeschreven bij de Kamer van Koophandel onder nummer 42045867). De verwerkingsverantwoordelijke voor de verwerkingen die in dit beleid zijn beschreven is Mirah Ventures. Voor verwerkingen die plaatsvinden in opdracht van een aangesloten salon (bijv. boekingsgegevens van klanten van die salon) treedt Mirah Ventures op als verwerker; de salon is dan zelfstandig verwerkingsverantwoordelijke. Zie ook de Verwerkersovereenkomst (vellu.cc/dpa)."],
      ["Welke gegevens verzamelen wij?", "Bij het boeken van een afspraak: naam, e-mailadres, telefoonnummer (optioneel). Bij het aanmaken van een salonaccount: bedrijfsnaam, e-mailadres, wachtwoord, vestigingsgegevens. Optioneel en alleen met jouw expliciete toestemming: allergie-informatie die je zelf invult bij het boeken."],
      ["Bijzondere persoonsgegevens (gezondheid)", "Het veld 'allergieën' op het boekingsformulier is optioneel. Als je deze informatie invult, geldt dit als expliciete toestemming (Art. 9(2)(a) AVG) voor het verwerken van gezondheidsgegevens met als uitsluitend doel een veilige behandeling. Deze gegevens worden alleen gedeeld met de betreffende salon en worden niet gebruikt voor marketing, analyse of profilering. Je kunt je toestemming op elk moment intrekken via info@vellu.cc; in dat geval worden de gegevens binnen 30 dagen verwijderd."],
      ["Waarvoor gebruiken wij je gegevens?", "Het verwerken en bevestigen van boekingen (grondslag: uitvoering overeenkomst, Art. 6(1)(b) AVG), het versturen van afspraakherinneringen en follow-ups (grondslag: gerechtvaardigd belang, Art. 6(1)(f) AVG — je kunt je hiertegen verzetten via de opt-out link onderaan elke e-mail), het beheren van je salonaccount en het verbeteren van onze dienstverlening. Wij gebruiken je gegevens nooit voor geautomatiseerde besluitvorming of profilering."],
      ["Hoe lang bewaren wij je gegevens?", "Boekingsgegevens: zolang het salonaccount actief is, plus 30 dagen na verwijdering. Financiële gegevens: 7 jaar (wettelijke bewaarplicht). Na verwijdering van je account worden alle persoonsgegevens binnen 30 dagen gewist."],
      ["Delen wij je gegevens?", "Wij delen je gegevens alleen met: Supabase (database hosting, opslag in EU-regio Ierland, eu-west-1), Resend (email verzending via Amazon SES EU-West-1 Ierland), Vercel (website hosting, edge netwerk met EU-nodes), Sentry (foutmonitoring van de app, verwerkt in EU-regio Frankfurt; ontvangt alleen technische foutmeldingen met browser- en paginagegevens, nooit wachtwoorden of betaalgegevens), Mollie (Mollie B.V., Amsterdam — betalingsverwerking voor Vellu-abonnementen: naam, e-mailadres en betaalgegevens; kaart- en rekeninggegevens voer je in bij Mollie zelf en ziet Vellu niet), Anthropic (Anthropic PBC, VS — uitsluitend voor de AI-chatbot 'Vellu-assistent' in de app: de berichten die je in dat chatvenster typt en, als je bent ingelogd, de naam, het abonnement en het land van je salon worden via Anthropics API in de VS verwerkt om het antwoord te maken; volgens Anthropics commerciële voorwaarden worden deze gegevens niet gebruikt om modellen te trainen; gebruik de chat daarom niet voor klantgegevens die niet nodig zijn voor je vraag) en DeepL (DeepL SE, Keulen, EU — alleen de teksten die je zelf laat vertalen, zoals dienstnamen en -beschrijvingen; geen persoonsgegevens). Supabase, Resend, Vercel en Sentry zijn in de VS gevestigd maar verwerken de data in EU-datacenters; Mollie en DeepL zijn in de EU gevestigd. Voor doorgifte naar de VS (de AI-chatbot en eventuele support-toegang door een moedermaatschappij) gelden Standard Contractual Clauses (SCC's) conform Uitvoeringsbesluit (EU) 2021/914 en, waar de ontvanger gecertificeerd is, het EU-US Data Privacy Framework. Alle verwerkers zijn gebonden aan verwerkersovereenkomsten. Wij verkopen nooit je gegevens aan derden."],
      ["Google API Services — agenda-integratie", "Als je er zelf voor kiest om je Google Agenda te koppelen, vraagt Vellu de scope 'https://www.googleapis.com/auth/calendar.events' aan. Vellu gebruikt deze toegang uitsluitend om: (a) nieuwe bevestigde boekingen als event in jouw Google Agenda te zetten, (b) bestaande events bij te werken als een afspraak wijzigt, (c) events te verwijderen bij annulering. Vellu leest géén andere events uit je agenda en deelt deze data nooit met derden, gebruikt ze niet voor advertenties, en traint er geen AI-modellen mee. Het gebruik van informatie verkregen via Google API's voldoet aan het Google API Services User Data Policy, inclusief de 'Limited Use'-vereisten. Een uitgebreide beschrijving staat op vellu.cc/integrations/google. Je kunt de koppeling op elk moment intrekken in Instellingen of via je Google-account op myaccount.google.com/permissions."],
      ["Cookies en lokale opslag", "Wij gebruiken uitsluitend strikt noodzakelijke cookies en localStorage-items: inlogsessie (Supabase Auth), taalvoorkeur, thema (licht/donker), en het onthouden of je de 'app installeren'-melding hebt gesloten. Deze zijn noodzakelijk voor de werking van het platform en vallen onder de uitzondering van art. 11.7a lid 3 Telecommunicatiewet (implementatie ePrivacy-richtlijn). Wij gebruiken géén tracking cookies, géén third-party analytics en géén advertentiepixels. Mocht dit in de toekomst veranderen, dan vragen wij eerst om je toestemming via een banner."],
      ["Je rechten", "Onder de AVG heb je recht op: inzage (Art. 15), correctie (Art. 16), verwijdering (Art. 17), beperking van verwerking (Art. 18), gegevensoverdraagbaarheid (Art. 20), bezwaar (Art. 21), en intrekking van toestemming (Art. 7(3)). Je kunt ook een klacht indienen bij de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl). Stuur je verzoek naar info@vellu.cc; we reageren binnen 1 maand conform Art. 12(3) AVG. Voor identificatiedoeleinden kunnen we je vragen om aanvullende verificatie."],
      ["Leeftijd", "Je moet minimaal 16 jaar oud zijn om zelfstandig een boeking te plaatsen. Ben je jonger dan 16, dan is toestemming van een ouder of voogd vereist (Art. 8 AVG). Vellu controleert dit niet actief; saloneigenaren zijn medeverantwoordelijk voor het correct omgaan met minderjarige klanten."],
      ["Bewaartermijnen per categorie", "Boekingsgegevens: tot einde abonnement salon + 30 dagen. Factureringsgegevens: 7 jaar (art. 52 AWR). E-mail logs (bounces, opt-outs): 2 jaar. Allergie-informatie: alleen zolang het salonaccount actief is, onmiddellijke verwijdering op verzoek."],
      ["Contact", "Voor vragen over dit privacybeleid: info@vellu.cc"]
    ]
  } : {
    title: "Privacy Policy",
    updated: "Last updated: April 2026",
    sections: [
      ["Who are we?", "Vellu is an online booking platform for beauty professionals, hairdressers, nail salons, lash artists, and other personal-care businesses. Vellu is a product of Mirah Ventures (a Dutch sole proprietorship based in Amersfoort, registered with the Dutch Chamber of Commerce under number 42045867). The data controller for the processing described in this policy is Mirah Ventures. For processing carried out on behalf of an affiliated salon (e.g. booking data of that salon's clients), Mirah Ventures acts as a data processor; the salon is then the independent data controller. See also the Data Processing Agreement (vellu.cc/dpa)."],
      ["What data do we collect?", "When booking an appointment: name, email address, phone number (optional). When creating a salon account: business name, email address, password, location details. Optionally and only with your explicit consent: allergy information you voluntarily enter when booking."],
      ["Special-category data (health)", "The 'allergies' field on the booking form is optional. If you fill it in, this counts as explicit consent (Art. 9(2)(a) GDPR) to process health data for the sole purpose of ensuring a safe treatment. This data is shared only with the relevant salon and is never used for marketing, analytics or profiling. You can withdraw your consent at any time via info@vellu.cc; the data will then be erased within 30 days."],
      ["What do we use your data for?", "Processing and confirming bookings (legal basis: performance of contract, Art. 6(1)(b) GDPR), sending appointment reminders and follow-ups (legal basis: legitimate interest, Art. 6(1)(f) GDPR — you may object via the opt-out link at the bottom of every email), managing your salon account, and improving our services. We never use your data for automated decision-making or profiling."],
      ["How long do we store your data?", "Booking data: as long as the salon account is active, plus 30 days after deletion. Financial records: 7 years (legal retention requirement). After account deletion, all personal data is erased within 30 days."],
      ["Do we share your data?", "We only share your data with: Supabase (database hosting, storage in EU region Ireland, eu-west-1), Resend (email delivery via Amazon SES EU-West-1 Ireland), Vercel (website hosting, edge network with EU nodes), Sentry (application error monitoring, processed in the EU region Frankfurt; receives only technical error reports with browser and page data, never passwords or payment details), Mollie (Mollie B.V., Amsterdam — payment processing for Vellu subscriptions: name, email address and payment details; card and bank details are entered with Mollie directly and are never seen by Vellu), Anthropic (Anthropic PBC, US — solely for the AI chatbot 'Vellu assistant' in the app: the messages you type into that chat window and, when logged in, your salon's name, plan and country are processed via Anthropic's API in the US to generate the reply; under Anthropic's commercial terms this data is not used to train models; please don't use the chat for client data that isn't needed for your question) and DeepL (DeepL SE, Cologne, EU — only the texts you choose to translate, such as service names and descriptions; no personal data). Supabase, Resend, Vercel and Sentry are US-incorporated but process data in EU datacenters; Mollie and DeepL are EU companies. Transfers to the US (the AI chatbot, and any parent-company support access) are covered by Standard Contractual Clauses (SCCs) per Implementing Decision (EU) 2021/914 and, where the recipient is certified, the EU-US Data Privacy Framework. All processors are bound by data processing agreements. We never sell your data to third parties."],
      ["Google API Services — calendar integration", "If you opt in to connecting your Google Calendar, Vellu requests the 'https://www.googleapis.com/auth/calendar.events' scope. Vellu uses this access solely to: (a) create a calendar event in your Google Calendar for each confirmed booking, (b) update events when a booking changes, (c) delete events when a booking is cancelled. Vellu does not read other events on your calendar, never shares this data with third parties, does not use it for advertising, and does not train AI models on it. Vellu's use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. A full description is at vellu.cc/integrations/google. You can disconnect at any time in Settings or via myaccount.google.com/permissions."],
      ["Cookies and local storage", "We only use strictly necessary cookies and localStorage items: login session (Supabase Auth), language preference, theme (light/dark), and remembering whether you dismissed the 'install app' prompt. These are necessary for the platform to function and fall under the exemption in art. 11.7a(3) Dutch Telecommunications Act (implementing the ePrivacy Directive). We do not use tracking cookies, third-party analytics, or advertising pixels. If this ever changes we will ask for consent via a banner first."],
      ["Your rights", "Under GDPR you have the right to: access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20), objection (Art. 21), and withdrawal of consent (Art. 7(3)). You may also lodge a complaint with the Dutch Data Protection Authority (autoriteitpersoonsgegevens.nl). Email info@vellu.cc; we respond within 1 month per Art. 12(3) GDPR. We may ask for additional verification to confirm your identity."],
      ["Age", "You must be at least 16 years old to place a booking independently. If you are under 16, parental consent is required (Art. 8 GDPR). Vellu does not actively verify age; salon owners share responsibility for handling minor clients correctly."],
      ["Retention periods by category", "Booking data: until end of salon subscription + 30 days. Invoicing data: 7 years (Dutch tax law, art. 52 AWR). Email logs (bounces, opt-outs): 2 years. Allergy information: only while the salon account is active, immediate erasure on request."],
      ["Contact", "For questions about this privacy policy: info@vellu.cc"]
    ]
  };

  return (
    <Layout>

      <div style={{ background: c.bg, minHeight: "100dvh", fontFamily: "'Jost',sans-serif", color: c.text, padding: "40px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { if (window.history.length > 1) navigate(-1); else navigate("/"); }}>← {t.back}</button>
            <div style={{ display: "flex", gap: 8 }}><ThemeToggle /><LangToggle lang={lang} setLang={setLang} /></div>
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, marginBottom: 8 }}>{content.title}</div>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 32 }}>{content.updated}</div>
          {content.sections.map(([title, body], i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7 }}>{body}</div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}

// ─── TERMS OF SERVICE ────────────────────────────────────────
function TermsPage({ lang, setLang }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const t = T[lang];
  useSEO({ title: lang === "nl" ? "Voorwaarden | Vellu" : "Terms of Service | Vellu", url: "https://vellu.cc/terms" });
  const content = lang === "nl" ? {
    title: "Algemene Voorwaarden",
    updated: "Laatst bijgewerkt: april 2026",
    sections: [
      ["1. Aanvaarding van de voorwaarden", "Het Vellu-platform (vellu.cc) wordt aangeboden door Mirah Ventures, een eenmanszaak gevestigd te Amersfoort, ingeschreven bij de Kamer van Koophandel onder nummer 42045867 (\"Vellu\", \"wij\", \"ons\"). Door gebruik te maken van het platform ga je akkoord met deze Algemene Voorwaarden. Als je niet akkoord gaat, verzoeken wij je het platform niet te gebruiken. Vellu behoudt zich het recht voor deze voorwaarden op elk moment te wijzigen. Wijzigingen worden via het platform gecommuniceerd."],
      ["2. Beschrijving van de dienst", "Vellu is een online boekingsplatform voor beautyprofessionals in Nederland, waaronder nagelsalons, wimperspecialisten, kappers en schoonheidsspecialisten. Het platform biedt saloneigenaren een eigen boekingspagina (vellu.cc/jouw-naam), agendabeheer, teamaccounts, e-mailnotificaties en een klantbeheersysteem. Vellu werkt met een vast maandelijks abonnement zonder commissie op boekingen."],
      ["3. Accountregistratie", "Om het platform te gebruiken als saloneigenaar dien je een account aan te maken met een geldig e-mailadres en wachtwoord. Je bent verantwoordelijk voor het vertrouwelijk houden van je inloggegevens en voor alle activiteiten die onder je account plaatsvinden. Vellu mag accounts opschorten of beëindigen bij vermoeden van misbruik of schending van deze voorwaarden."],
      ["4. Abonnementen en betaling", "Vellu biedt twee abonnementsvormen: Starter (€19/maand incl. BTW) en Professional (€35/maand incl. BTW). Genoemde bedragen zijn inclusief 21% Nederlandse BTW waar wettelijk verplicht; zakelijke afnemers met een geldig EU BTW-nummer buiten Nederland kunnen in aanmerking komen voor BTW-verlegging. Beide plannen hanteren 0% commissie op boekingen — je betaalt uitsluitend het vaste maandbedrag. Abonnementen worden maandelijks gefactureerd. Je kunt je abonnement op elk moment opzeggen; het blijft actief tot het einde van de betaalde periode. Vellu behoudt zich het recht voor prijzen te wijzigen, met een kennisgeving van minimaal 30 dagen; bestaande abonnementen behouden hun huidige prijs tot aan hun volgende verlengdatum na de wijziging."],
      ["5. Verplichtingen van de saloneigenaar", "Als saloneigenaar ben je verantwoordelijk voor: het correct en actueel houden van je salongegevens, diensten en prijzen; het nakomen van afspraken die via het platform worden geboekt; het voldoen aan alle toepasselijke wet- en regelgeving met betrekking tot je bedrijfsvoering, waaronder de AVG (GDPR) voor het verwerken van klantgegevens; het correct vermelden van je KVK-nummer, BTW-id en overige bedrijfsgegevens indien van toepassing."],
      ["6. Klanten en eindgebruikers", "Klanten die een afspraak boeken via Vellu gaan een overeenkomst aan met de betreffende salon, niet met Vellu. Vellu treedt uitsluitend op als bemiddelaar en is geen partij bij de behandelovereenkomst. Klanten ontvangen een bevestigingsmail met de mogelijkheid om de afspraak te annuleren via een unieke link. Het annuleringsbeleid wordt bepaald door de individuele salon."],
      ["7. Intellectueel eigendom", "Alle rechten op het Vellu-platform, inclusief de software, het ontwerp, de logo's en de content, berusten bij Vellu. Saloneigenaren behouden de rechten op hun eigen content, zoals foto's, beschrijvingen en logo's die zij uploaden. Door content te uploaden verleen je Vellu een beperkte licentie om deze content weer te geven op jouw boekingspagina."],
      ["8. Privacy en gegevensverwerking", "Vellu verwerkt persoonsgegevens in overeenstemming met de Algemene Verordening Gegevensbescherming (AVG). Zie ons Privacybeleid op vellu.cc/privacy voor volledige informatie over hoe wij gegevens verzamelen, gebruiken en beschermen. Vellu treedt op als verwerker namens de saloneigenaar, die de verwerkingsverantwoordelijke is voor de gegevens van zijn of haar klanten."],
      ["9. Beschikbaarheid", "Vellu streeft naar een zo hoog mogelijke beschikbaarheid van het platform, maar kan geen 100% uptime garanderen. Vellu is niet aansprakelijk voor schade als gevolg van tijdelijke onbeschikbaarheid, storingen of onderhoud. Gepland onderhoud wordt waar mogelijk vooraf gecommuniceerd."],
      ["10. Aansprakelijkheid", "Vellu is niet aansprakelijk voor: schade voortvloeiend uit het gebruik van het platform of de onmogelijkheid daarvan; gemiste afspraken, no-shows of geschillen tussen salons en klanten; indirecte schade, gevolgschade of gederfde winst. De totale aansprakelijkheid van Vellu is beperkt tot het bedrag dat je in de afgelopen 3 maanden aan abonnementskosten hebt betaald."],
      ["11. Beëindiging", "Je kunt je account op elk moment beëindigen door contact op te nemen met Vellu. Na beëindiging wordt je boekingspagina gedeactiveerd en worden je gegevens verwijderd conform ons Privacybeleid. Vellu kan je account beëindigen bij schending van deze voorwaarden met een kennisgeving per e-mail en een opzegtermijn van ten minste 14 dagen, tenzij (i) de schending ernstig of herhaaldelijk is, of (ii) direct ingrijpen noodzakelijk is ter bescherming van klanten, andere gebruikers of de integriteit van het platform — in die gevallen kan beëindiging met onmiddellijke ingang plaatsvinden. Reeds betaalde abonnementskosten over de resterende periode worden pro rata terugbetaald, behalve bij beëindiging wegens ernstige schending."],
      ["12. Toepasselijk recht", "Op deze voorwaarden is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in Den Haag, Nederland."],
      ["13. Contact", "Voor vragen over deze Algemene Voorwaarden kun je contact opnemen via info@vellu.cc."]
    ]
  } : {
    title: "Terms of Service",
    updated: "Last updated: April 2026",
    sections: [
      ["1. Acceptance of terms", "The Vellu platform (vellu.cc) is operated by Mirah Ventures, a Dutch sole proprietorship based in Amersfoort, registered with the Dutch Chamber of Commerce under number 42045867 (\"Vellu\", \"we\", \"us\"). By using the platform, you agree to these Terms of Service. If you do not agree, please do not use the platform. Vellu reserves the right to modify these terms at any time. Changes will be communicated through the platform."],
      ["2. Description of service", "Vellu is an online booking platform for beauty professionals in the Netherlands, including nail technicians, lash artists, hairdressers, and beauticians. The platform offers salon owners their own booking page (vellu.cc/your-name), calendar management, team accounts, email notifications, and a client management system. Vellu operates on a flat monthly subscription with no commission on bookings."],
      ["3. Account registration", "To use the platform as a salon owner, you must create an account with a valid email address and password. You are responsible for keeping your login credentials confidential and for all activities that occur under your account. Vellu may suspend or terminate accounts if abuse or violation of these terms is suspected."],
      ["4. Subscriptions and payment", "Vellu offers two subscription plans: Starter (€19/month incl. VAT) and Professional (€35/month incl. VAT). Prices include 21% Dutch VAT where legally required; business customers with a valid EU VAT number outside the Netherlands may qualify for VAT reverse charge. Both plans charge 0% commission on bookings — you only pay the flat monthly fee. Subscriptions are billed monthly. You may cancel your subscription at any time; it remains active until the end of the paid period. Vellu reserves the right to change prices with at least 30 days' notice; existing subscriptions retain their current price until their next renewal date following the change."],
      ["5. Salon owner obligations", "As a salon owner, you are responsible for: keeping your salon details, services, and prices accurate and up to date; honoring appointments booked through the platform; complying with all applicable laws and regulations regarding your business operations, including GDPR for processing client data; correctly listing your Chamber of Commerce number, VAT ID, and other business details where applicable."],
      ["6. Clients and end users", "Clients who book an appointment through Vellu enter into an agreement with the respective salon, not with Vellu. Vellu acts solely as an intermediary and is not a party to the treatment agreement. Clients receive a confirmation email with the option to cancel via a unique link. Cancellation policies are determined by each individual salon."],
      ["7. Intellectual property", "All rights to the Vellu platform, including the software, design, logos, and content, belong to Vellu. Salon owners retain the rights to their own content, such as photos, descriptions, and logos they upload. By uploading content, you grant Vellu a limited license to display this content on your booking page."],
      ["8. Privacy and data processing", "Vellu processes personal data in accordance with the General Data Protection Regulation (GDPR). See our Privacy Policy at vellu.cc/privacy for full information on how we collect, use, and protect data. Vellu acts as a processor on behalf of the salon owner, who is the data controller for their clients' data."],
      ["9. Availability", "Vellu strives for the highest possible platform availability but cannot guarantee 100% uptime. Vellu is not liable for damages resulting from temporary unavailability, outages, or maintenance. Planned maintenance will be communicated in advance where possible."],
      ["10. Liability", "Vellu is not liable for: damages arising from the use of the platform or the inability to use it; missed appointments, no-shows, or disputes between salons and clients; indirect damages, consequential damages, or lost profits. Vellu's total liability is limited to the amount you have paid in subscription fees over the past 3 months."],
      ["11. Termination", "You may terminate your account at any time by contacting Vellu. Upon termination, your booking page will be deactivated and your data will be deleted in accordance with our Privacy Policy. Vellu may terminate your account for violation of these terms with email notification and at least 14 days' notice, except (i) in cases of serious or repeated violations, or (ii) where immediate action is necessary to protect clients, other users, or platform integrity — in such cases termination may take effect immediately. Prepaid subscription fees for the remaining period will be refunded pro rata, except in cases of termination for serious violation."],
      ["12. Governing law", "These terms are governed by Dutch law. Disputes shall be submitted to the competent court in The Hague, the Netherlands."],
      ["13. Contact", "For questions about these Terms of Service, please contact us at info@vellu.cc."]
    ]
  };

  return (
    <Layout>

      <div style={{ background: c.bg, minHeight: "100dvh", fontFamily: "'Jost',sans-serif", color: c.text, padding: "40px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { if (window.history.length > 1) navigate(-1); else navigate("/"); }}>← {t.back}</button>
            <div style={{ display: "flex", gap: 8 }}><ThemeToggle /><LangToggle lang={lang} setLang={setLang} /></div>
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, marginBottom: 8 }}>{content.title}</div>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 32 }}>{content.updated}</div>
          {content.sections.map(([title, body], i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7 }}>{body}</div>
            </div>
          ))}
          <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid " + c.border, display: "flex", gap: 16, fontSize: 11, color: c.textMuted }}>
            <a href="/privacy" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Privacybeleid" : "Privacy Policy"}</a>
            <a href="/" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Terug naar home" : "Back to home"}</a>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── CONTACT / ABOUT PAGE ────────────────────────────────────
function ContactPage({ lang, setLang }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const t = T[lang];
  useSEO({ title: lang === "nl" ? "Contact | Vellu" : "Contact | Vellu", url: "https://vellu.cc/contact" });
  const content = lang === "nl" ? {
    title: "Over Vellu", subtitle: "Het verhaal achter het platform",
    mission: "Vellu is gebouwd met één missie: beauty professionals hun eigen online boekingsplatform geven, zonder commissie en zonder gedoe. Geen 10% per boeking, geen dure abonnementen met verborgen kosten. Gewoon een vast tarief en jouw merk voorop.",
    why: "Waarom Vellu?", whyText: "Te veel nagelsalons, kappers en wimperspecialisten zijn afhankelijk van platforms die een flink percentage van elke boeking pakken. Of ze werken met WhatsApp en DM's — prima, maar niet schaalbaar. Vellu geeft je je eigen professionele boekingspagina met jouw naam, jouw kleuren en jouw diensten. Klanten boeken direct, jij houdt 100% van je omzet.",
    who: "Wie zit erachter?", whoText: "Vellu is gebouwd door een solo developer uit Nederland met een passie voor technologie en ondernemerschap. Het platform is van de grond af opgebouwd met de focus op wat beauty professionals echt nodig hebben — niet meer, niet minder.",
    contact: "Contact", contactText: "Heb je vragen, feedback of wil je samenwerken? Neem gerust contact op.",
    emailLabel: "E-mail", responseTime: "We reageren meestal binnen 24 uur.",
    cta: "Klaar om te beginnen?", ctaText: "Maak gratis je eigen boekingspagina aan.", ctaBtn: "Gratis beginnen →",
    imprintTitle: "Bedrijfsgegevens",
    imprintIntro: "Overeenkomstig art. 3:15d BW:",
    imprintCompany: "Handelsnaam",
    imprintCompanyValue: "Vellu (een product van Mirah Ventures)",
    imprintOwner: "Onderneming",
    imprintOwnerValue: "Mirah Ventures (eenmanszaak)",
    imprintAddress: "Vestigingsadres",
    imprintAddressValue: "Amersfoort, Nederland — volledig adres op aanvraag via info@vellu.cc",
    imprintKvk: "KVK-nummer",
    imprintKvkValue: "42045867",
    imprintVat: "BTW-id",
    imprintVatValue: "NL005453873B29",
    imprintAuthority: "Toezichthouder",
    imprintAuthorityValue: "Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl)",
  } : {
    title: "About Vellu", subtitle: "The story behind the platform",
    mission: "Vellu was built with one mission: give beauty professionals their own online booking platform, without commission and without hassle. No 10% per booking, no expensive subscriptions with hidden costs. Just a flat rate and your brand front and center.",
    why: "Why Vellu?", whyText: "Too many nail salons, hairdressers, and lash artists depend on platforms that take a significant percentage of every booking. Or they work with WhatsApp and DMs — fine, but not scalable. Vellu gives you your own professional booking page with your name, your colors, and your services. Clients book directly, you keep 100% of your revenue.",
    who: "Who's behind it?", whoText: "Vellu is built by a solo developer from the Netherlands with a passion for technology and entrepreneurship. The platform is built from the ground up with a focus on what beauty professionals actually need — nothing more, nothing less.",
    contact: "Contact", contactText: "Got questions, feedback, or want to collaborate? Don't hesitate to reach out.",
    emailLabel: "Email", responseTime: "We usually respond within 24 hours.",
    cta: "Ready to get started?", ctaText: "Create your free booking page.", ctaBtn: "Get started free →",
    imprintTitle: "Company details",
    imprintIntro: "Pursuant to art. 3:15d Dutch Civil Code:",
    imprintCompany: "Trade name",
    imprintCompanyValue: "Vellu (a product of Mirah Ventures)",
    imprintOwner: "Business",
    imprintOwnerValue: "Mirah Ventures (Dutch sole proprietorship)",
    imprintAddress: "Registered address",
    imprintAddressValue: "Amersfoort, Netherlands — full address on request via info@vellu.cc",
    imprintKvk: "Chamber of Commerce No.",
    imprintKvkValue: "42045867",
    imprintVat: "VAT ID",
    imprintVatValue: "NL005453873B29",
    imprintAuthority: "Supervisory authority",
    imprintAuthorityValue: "Dutch Data Protection Authority (autoriteitpersoonsgegevens.nl)",
  };
  return (
    <Layout>

      <div style={{ background: c.bg, minHeight: "100dvh", fontFamily: "'Jost',sans-serif", color: c.text, padding: "40px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { if (window.history.length > 1) navigate(-1); else navigate("/"); }}>← {t.back}</button>
            <div style={{ display: "flex", gap: 8 }}><ThemeToggle /><LangToggle lang={lang} setLang={setLang} /></div>
          </div>
          <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 28, fontWeight: 300, letterSpacing: "0.18em", marginBottom: 8 }}>vellu</div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, marginBottom: 8 }}>{content.title}</div>
          <div style={{ fontSize: 13, color: c.textSub, marginBottom: 40 }}>{content.subtitle}</div>
          <div style={{ fontSize: 14, color: c.textSub, lineHeight: 1.8, marginBottom: 32, padding: "20px", background: `${ACCENT}08`, border: `1px solid ${ACCENT}1a`, borderRadius: 16 }}>{content.mission}</div>
          <div style={{ marginBottom: 32 }}><div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{content.why}</div><div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7 }}>{content.whyText}</div></div>
          <div style={{ marginBottom: 32 }}><div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{content.who}</div><div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7 }}>{content.whoText}</div></div>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{content.contact}</div>
            <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7, marginBottom: 16 }}>{content.contactText}</div>
            <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 16, padding: "20px" }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>{content.emailLabel}</div>
              <a href="mailto:info@vellu.cc" style={{ fontSize: 15, color: ACCENT, textDecoration: "none", fontWeight: 500 }}>info@vellu.cc</a>
              <div style={{ fontSize: 11, color: c.textMuted, marginTop: 8 }}>{content.responseTime}</div>
            </div>
          </div>
          <div style={{ textAlign: "center", padding: "28px 20px", background: `${ACCENT}08`, border: `1px solid ${ACCENT}1a`, borderRadius: 20, marginBottom: 32 }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, marginBottom: 8 }}>{content.cta}</div>
            <div style={{ fontSize: 12, color: c.textSub, marginBottom: 16 }}>{content.ctaText}</div>
            <button className="btn-primary" onClick={() => navigate("/owner")}>{content.ctaBtn}</button>
          </div>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{content.imprintTitle}</div>
            <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 14 }}>{content.imprintIntro}</div>
            <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 14, padding: "16px 18px", fontSize: 12, lineHeight: 1.9, color: c.textSub }}>
              {[
                [content.imprintCompany, content.imprintCompanyValue],
                [content.imprintOwner, content.imprintOwnerValue],
                [content.imprintAddress, content.imprintAddressValue],
                [content.imprintKvk, content.imprintKvkValue],
                [content.imprintVat, content.imprintVatValue],
                [content.imprintAuthority, content.imprintAuthorityValue],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${c.border}`, paddingBottom: 4, marginBottom: 4 }}>
                  <span style={{ color: c.textLabel, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</span>
                  <span style={{ textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ paddingTop: 20, borderTop: "1px solid " + c.border, display: "flex", gap: 16, fontSize: 11, color: c.textMuted }}>
            <a href="/privacy" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Privacybeleid" : "Privacy Policy"}</a>
            <a href="/terms" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{t.terms}</a>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── DATA PROCESSING AGREEMENT (VERWERKINGSOVEREENKOMST) ─────
function DpaPage({ lang, setLang }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const t = T[lang];
  useSEO({ title: lang === "nl" ? "Verwerkingsovereenkomst | Vellu" : "Data Processing Agreement | Vellu", url: "https://vellu.cc/dpa" });
  const content = lang === "nl" ? {
    title: "Verwerkingsovereenkomst",
    updated: "Laatst bijgewerkt: april 2026",
    intro: "Deze verwerkingsovereenkomst (\"Overeenkomst\") is van toepassing op de verwerking van persoonsgegevens door Mirah Ventures, eenmanszaak gevestigd te Amersfoort, KVK 42045867, h.o.d.n. Vellu (\"Verwerker\") namens de saloneigenaar die het Vellu-platform gebruikt (\"Verwerkingsverantwoordelijke\"). Deze overeenkomst maakt integraal onderdeel uit van de Algemene Voorwaarden van Vellu en wordt automatisch geaccepteerd bij het aanmaken van een account.",
    sections: [
      ["1. Definities", "Persoonsgegevens: alle gegevens die betrekking hebben op een geïdentificeerde of identificeerbare natuurlijke persoon. Verwerking: elke bewerking of geheel van bewerkingen met betrekking tot persoonsgegevens, waaronder het verzamelen, vastleggen, ordenen, structureren, opslaan, bijwerken, wijzigen, opvragen, raadplegen, gebruiken, verstrekken, verspreiden, wissen of vernietigen van gegevens. AVG: de Algemene Verordening Gegevensbescherming (EU) 2016/679."],
      ["2. Onderwerp en duur", "De Verwerker verwerkt persoonsgegevens ten behoeve van het aanbieden van het online boekingsplatform Vellu. De verwerking vindt plaats gedurende de looptijd van het abonnement van de Verwerkingsverantwoordelijke. Na beëindiging van het abonnement worden de gegevens verwijderd conform artikel 12 van deze overeenkomst."],
      ["3. Aard en doel van de verwerking", "De verwerking omvat: het opslaan en beheren van afspraken en boekingen; het versturen van e-mailbevestigingen, herinneringen en follow-ups; het beheren van klantgegevens namens de salon; het genereren van facturen en omzetoverzichten; het faciliteren van reviews en beoordelingen. Het doel is het aanbieden van een volledig boekings- en beheersysteem voor beautyprofessionals."],
      ["4. Soorten persoonsgegevens", "De volgende categorieën persoonsgegevens worden verwerkt: naam (voor- en achternaam) van klanten; e-mailadres van klanten; telefoonnummer (indien verstrekt); afspraakgegevens (datum, tijd, behandeling, prijs); allergie-informatie (indien verstrekt door de klant); reviewteksten en beoordelingen; bedrijfsgegevens van de saloneigenaar (naam, adres, KVK, BTW-id, IBAN)."],
      ["5. Categorieën betrokkenen", "De persoonsgegevens hebben betrekking op: klanten die een afspraak boeken via het Vellu-platform; saloneigenaren en hun medewerkers die het platform gebruiken."],
      ["6. Verplichtingen van de Verwerker", "De Verwerker verbindt zich ertoe: persoonsgegevens uitsluitend te verwerken in opdracht van en volgens de instructies van de Verwerkingsverantwoordelijke, tenzij een wettelijke verplichting anders vereist; te waarborgen dat personen die toegang hebben tot de persoonsgegevens zich tot geheimhouding hebben verbonden; passende technische en organisatorische maatregelen te nemen om een op het risico afgestemd beveiligingsniveau te waarborgen; geen persoonsgegevens te verwerken voor eigen commerciële doeleinden; de Verwerkingsverantwoordelijke onverwijld te informeren indien een instructie naar het oordeel van de Verwerker in strijd is met de AVG."],
      ["7. Sub-verwerkers", "De Verwerkingsverantwoordelijke geeft de Verwerker algemene toestemming om sub-verwerkers in te schakelen. De huidige sub-verwerkers zijn:\n\n• Supabase Inc. (San Francisco, VS) — database hosting en opslag. Data wordt verwerkt in de EU (Ierland, eu-west-1). Supabase is SOC2 Type II gecertificeerd.\n• Resend Inc. (San Francisco, VS) — e-mailverzending voor bevestigingen, herinneringen en facturen. Verwerkt via Amazon SES (EU-West-1, Ierland).\n• Vercel Inc. (San Francisco, VS) — website hosting en content delivery. Edge netwerk met nodes in de EU.\n• Functional Software, Inc. (Sentry) (San Francisco, VS) — foutmonitoring van de applicatie. Data wordt verwerkt in de EU (Frankfurt, Duitsland); uitsluitend technische foutmeldingen, geen wachtwoorden of betaalgegevens.\n• Anthropic PBC (San Francisco, VS) — uitsluitend voor de AI-chatbot ('Vellu-assistent') in het dashboard: de chatberichten van de eigenaar plus salonnaam, abonnement en land worden in de VS verwerkt om het antwoord te maken. Vellu stuurt zelf geen klant- of afspraakgegevens mee; doorgifte onder Standard Contractual Clauses; volgens Anthropics commerciële voorwaarden geen training van modellen op deze gegevens.\n• DeepL SE (Keulen, Duitsland) — vertaling van dienstnamen en -beschrijvingen op verzoek van de eigenaar. Verwerkt in de EU; geen persoonsgegevens.\n\nDe Verwerker informeert de Verwerkingsverantwoordelijke ten minste 30 dagen voorafgaand aan wijzigingen in sub-verwerkers. De Verwerkingsverantwoordelijke kan binnen deze periode schriftelijk bezwaar maken tegen een nieuwe sub-verwerker. Indien het bezwaar naar het redelijk oordeel van de Verwerker niet kan worden opgelost zonder de dienst wezenlijk aan te passen, heeft de Verwerkingsverantwoordelijke het recht om het abonnement met onmiddellijke ingang kosteloos te beëindigen, waarbij reeds betaalde bedragen voor de resterende periode pro rata worden terugbetaald."],
      ["8. Beveiligingsmaatregelen", "De Verwerker heeft de volgende technische en organisatorische maatregelen getroffen: versleuteling van gegevens in transit (TLS/SSL) en at rest; toegangscontrole op basis van Row Level Security (RLS) in de database; authenticatie via Supabase Auth met veilige wachtwoordopslag (bcrypt); geen opslag van betaalgegevens — betalingen worden afgehandeld door derden; regelmatige back-ups van de database; beperkte toegang tot productiedata."],
      ["9. Meldplicht datalekken", "De Verwerker informeert de Verwerkingsverantwoordelijke zonder onredelijke vertraging, en waar mogelijk binnen 48 uur, nadat hij kennis heeft genomen van een inbreuk in verband met persoonsgegevens (datalek). De melding bevat ten minste: de aard van het datalek; de categorieën en het aantal betrokkenen; de waarschijnlijke gevolgen; de maatregelen die zijn genomen of voorgesteld om het datalek aan te pakken."],
      ["10. Bijstand", "De Verwerker verleent de Verwerkingsverantwoordelijke bijstand bij: het nakomen van verzoeken van betrokkenen (inzage, correctie, verwijdering); het uitvoeren van een gegevensbeschermingseffectbeoordeling (DPIA) indien nodig; het melden van datalekken aan de Autoriteit Persoonsgegevens."],
      ["11. Controle en audit", "De Verwerkingsverantwoordelijke heeft het recht om audits uit te voeren of te laten uitvoeren om de naleving van deze overeenkomst te controleren. De Verwerker verleent hieraan medewerking en stelt alle relevante informatie beschikbaar. De kosten van een audit zijn voor rekening van de Verwerkingsverantwoordelijke, tenzij uit de audit blijkt dat de Verwerker zijn verplichtingen niet nakomt."],
      ["12. Teruggave en verwijdering", "Na beëindiging van het abonnement verwijdert de Verwerker alle persoonsgegevens binnen 30 dagen, tenzij bewaring wettelijk verplicht is. De Verwerkingsverantwoordelijke kan voorafgaand aan de verwijdering een kopie van de gegevens opvragen. Reeds geanonimiseerde of geaggregeerde gegevens (zoals omzetstatistieken) vallen buiten deze verplichting."],
      ["13. Aansprakelijkheid", "De aansprakelijkheid van de Verwerker is beperkt overeenkomstig de bepalingen in de Algemene Voorwaarden van Vellu. Beide partijen vrijwaren elkaar voor claims van derden die voortvloeien uit het niet nakomen van de verplichtingen uit deze overeenkomst."],
      ["14. Toepasselijk recht", "Op deze verwerkingsovereenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in Den Haag, Nederland."],
      ["15. Contact", "Voor vragen over deze verwerkingsovereenkomst kun je contact opnemen via info@vellu.cc."]
    ]
  } : {
    title: "Data Processing Agreement",
    updated: "Last updated: April 2026",
    intro: "This Data Processing Agreement (\"Agreement\") applies to the processing of personal data by Mirah Ventures, a Dutch sole proprietorship based in Amersfoort, registered with the Dutch Chamber of Commerce under number 42045867, trading as Vellu (\"Processor\") on behalf of the salon owner using the Vellu platform (\"Controller\"). This agreement is an integral part of the Vellu Terms of Service and is automatically accepted upon account creation.",
    sections: [
      ["1. Definitions", "Personal data: any data relating to an identified or identifiable natural person. Processing: any operation or set of operations performed on personal data, including collecting, recording, organizing, structuring, storing, adapting, altering, retrieving, consulting, using, disclosing, disseminating, erasing, or destroying data. GDPR: the General Data Protection Regulation (EU) 2016/679."],
      ["2. Subject matter and duration", "The Processor processes personal data for the purpose of providing the Vellu online booking platform. Processing takes place for the duration of the Controller's subscription. After termination of the subscription, data will be deleted in accordance with Article 12 of this agreement."],
      ["3. Nature and purpose of processing", "Processing includes: storing and managing appointments and bookings; sending email confirmations, reminders, and follow-ups; managing client data on behalf of the salon; generating invoices and revenue overviews; facilitating reviews and ratings. The purpose is to provide a complete booking and management system for beauty professionals."],
      ["4. Types of personal data", "The following categories of personal data are processed: name (first and last name) of clients; email address of clients; phone number (if provided); appointment data (date, time, treatment, price); allergy information (if provided by the client); review texts and ratings; business data of the salon owner (name, address, CoC, VAT ID, IBAN)."],
      ["5. Categories of data subjects", "The personal data relates to: clients who book an appointment through the Vellu platform; salon owners and their staff who use the platform."],
      ["6. Obligations of the Processor", "The Processor commits to: processing personal data solely on behalf of and in accordance with the instructions of the Controller, unless required otherwise by law; ensuring that persons authorized to process personal data have committed to confidentiality; implementing appropriate technical and organizational measures to ensure a level of security appropriate to the risk; not processing personal data for its own commercial purposes; informing the Controller without delay if an instruction, in the Processor's opinion, violates the GDPR."],
      ["7. Sub-processors", "The Controller grants the Processor general authorization to engage sub-processors. The current sub-processors are:\n\n• Supabase Inc. (San Francisco, US) — database hosting and storage. Data is processed in the EU (Ireland, eu-west-1). Supabase is SOC2 Type II certified.\n• Resend Inc. (San Francisco, US) — email delivery for confirmations, reminders, and invoices. Processed via Amazon SES (EU-West-1, Ireland).\n• Vercel Inc. (San Francisco, US) — website hosting and content delivery. Edge network with nodes in the EU.\n• Functional Software, Inc. (Sentry) (San Francisco, US) — application error monitoring. Data is processed in the EU (Frankfurt, Germany); technical error reports only, never passwords or payment details.\n• Anthropic PBC (San Francisco, US) — solely for the AI chatbot ('Vellu assistant') in the dashboard: the owner's chat messages plus salon name, plan and country are processed in the US to generate the reply. Vellu itself sends no client or appointment data; transfer under Standard Contractual Clauses; under Anthropic's commercial terms no model training on this data.\n• DeepL SE (Cologne, Germany) — translation of service names and descriptions at the owner's request. Processed in the EU; no personal data.\n\nThe Processor will inform the Controller at least 30 days in advance of changes to sub-processors. The Controller may object in writing within this period. If the Processor reasonably determines the objection cannot be resolved without materially altering the service, the Controller has the right to terminate the subscription with immediate effect at no cost, with pro-rata refund of prepaid fees for the remaining period."],
      ["8. Security measures", "The Processor has implemented the following technical and organizational measures: encryption of data in transit (TLS/SSL) and at rest; access control based on Row Level Security (RLS) in the database; authentication via Supabase Auth with secure password storage (bcrypt); no storage of payment data — payments are handled by third parties; regular database backups; limited access to production data."],
      ["9. Data breach notification", "The Processor will inform the Controller without undue delay, and where possible within 48 hours, after becoming aware of a personal data breach. The notification will include at minimum: the nature of the breach; the categories and number of data subjects affected; the likely consequences; the measures taken or proposed to address the breach."],
      ["10. Assistance", "The Processor will assist the Controller with: fulfilling data subject requests (access, correction, deletion); conducting a Data Protection Impact Assessment (DPIA) if necessary; reporting data breaches to the Data Protection Authority."],
      ["11. Audit and inspection", "The Controller has the right to conduct or commission audits to verify compliance with this agreement. The Processor will cooperate and make all relevant information available. Audit costs are borne by the Controller, unless the audit reveals non-compliance by the Processor."],
      ["12. Return and deletion", "After termination of the subscription, the Processor will delete all personal data within 30 days, unless retention is legally required. The Controller may request a copy of the data prior to deletion. Already anonymized or aggregated data (such as revenue statistics) is excluded from this obligation."],
      ["13. Liability", "The Processor's liability is limited in accordance with the provisions in the Vellu Terms of Service. Both parties indemnify each other against third-party claims arising from non-compliance with the obligations under this agreement."],
      ["14. Governing law", "This data processing agreement is governed by Dutch law. Disputes shall be submitted to the competent court in The Hague, the Netherlands."],
      ["15. Contact", "For questions about this data processing agreement, please contact us at info@vellu.cc."]
    ]
  };
  return (
    <Layout>

      <div style={{ background: c.bg, minHeight: "100dvh", fontFamily: "'Jost',sans-serif", color: c.text, padding: "40px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { if (window.history.length > 1) navigate(-1); else navigate("/"); }}>← {t.back}</button>
            <div style={{ display: "flex", gap: 8 }}><ThemeToggle /><LangToggle lang={lang} setLang={setLang} /></div>
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, marginBottom: 8 }}>{content.title}</div>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 20 }}>{content.updated}</div>
          <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7, marginBottom: 32, padding: "16px 20px", background: `${ACCENT}08`, border: `1px solid ${ACCENT}1a`, borderRadius: 14 }}>{content.intro}</div>
          {content.sections.map(([title, body], i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{body}</div>
            </div>
          ))}
          <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid " + c.border, display: "flex", gap: 16, fontSize: 11, color: c.textMuted }}>
            <a href="/privacy" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Privacybeleid" : "Privacy Policy"}</a>
            <a href="/terms" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{t.terms}</a>
            <a href="/" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Terug naar home" : "Back to home"}</a>
          </div>
        </div>
      </div>
    </Layout>
  );
}


// ─── GOOGLE CALENDAR INTEGRATION PAGE ────────────────────────
// A public-facing, human-readable description of the Google Calendar
// integration. Exists primarily to support Google OAuth verification —
// reviewers appreciate a dedicated page (separate from the privacy policy
// section) that explains in plain language what the app does with Google
// user data, lists the exact scope requested, and duplicates the Limited
// Use disclosure. Also useful for salon owners who are cautious about
// granting calendar access.
function GoogleIntegrationPage({ lang, setLang }) {
  const { colors: c } = useTheme();
  const navigate = useNavigate();
  const t = T[lang];
  useSEO({ title: lang === "nl" ? "Google Agenda-integratie | Vellu" : "Google Calendar Integration | Vellu", url: "https://vellu.cc/integrations/google" });

  const content = lang === "nl" ? {
    title: "Google Agenda-integratie",
    subtitle: "Hoe Vellu je Google Agenda gebruikt — in gewone taal.",
    updated: "Laatst bijgewerkt: april 2026",
    overview: "Deze koppeling is optioneel. Vellu werkt prima zonder. Als je ervoor kiest je Google Agenda te verbinden, synchroniseert Vellu je salonboekingen automatisch naar je agenda zodat je ze ziet naast al je andere afspraken.",
    scopeTitle: "Welke toestemming vraagt Vellu?",
    scopeName: "https://www.googleapis.com/auth/calendar.events",
    scopeDesc: "Met deze scope kan Vellu events in je agenda aanmaken, bijwerken en verwijderen. Vellu kan géén andere events uit je agenda lezen, en heeft géén toegang tot andere agenda's dan de gekoppelde.",
    stepsTitle: "Wat gebeurt er bij elke actie?",
    steps: [
      { icon: "plus", title: "Nieuwe boeking", body: "Een klant boekt een afspraak via je Vellu-pagina. Vellu maakt direct een event aan in je Google Agenda met de naam van de klant, de behandeling, de tijd en de duur." },
      { icon: "edit", title: "Boeking gewijzigd", body: "Als een klant herplant of jij de afspraak aanpast in de dashboard, werkt Vellu het bijbehorende event bij — één-op-één, geen duplicaten." },
      { icon: "xmark", title: "Boeking geannuleerd", body: "Bij annulering verwijdert Vellu het event automatisch, zodat je agenda altijd klopt." },
    ],
    limitedUseTitle: "Limited Use-verklaring",
    limitedUseBody: "Het gebruik door Vellu van informatie die is ontvangen via Google API's voldoet aan het Google API Services User Data Policy, inclusief de Limited Use-vereisten. Concreet betekent dit:",
    limitedUseBullets: [
      "We gebruiken je Google-data uitsluitend om de bovenstaande salonfuncties te leveren.",
      "We verkopen of verhandelen je Google-data nooit.",
      "We delen je Google-data nooit voor advertenties of targeting.",
      "We trainen geen AI-modellen op je Google-data.",
      "Menselijke toegang tot je Google-data is alleen toegestaan bij expliciete toestemming, voor security-onderzoek, of wettelijk verplichte redenen.",
    ],
    disconnectTitle: "Hoe intrekken?",
    disconnectBody: "Je kunt de koppeling op twee manieren verwijderen. Beide werken onmiddellijk: bestaande events blijven in je agenda staan, nieuwe events worden niet meer aangemaakt.",
    disconnectSteps: [
      "In Vellu: Instellingen → Overig → Google Agenda → 'Loskoppelen'.",
      "Op Google: myaccount.google.com/permissions → zoek Vellu → 'Toegang intrekken'.",
    ],
    moreTitle: "Meer informatie",
    moreBody: "Voor een volledig overzicht van gegevensverwerking en je rechten onder de AVG, zie ons privacybeleid.",
    privacyLabel: "Lees ons privacybeleid →",
  } : {
    title: "Google Calendar Integration",
    subtitle: "How Vellu uses your Google Calendar — in plain language.",
    updated: "Last updated: April 2026",
    overview: "This integration is optional. Vellu works fine without it. If you choose to connect your Google Calendar, Vellu automatically syncs your salon bookings to your calendar so you see them alongside everything else in your day.",
    scopeTitle: "What permission does Vellu request?",
    scopeName: "https://www.googleapis.com/auth/calendar.events",
    scopeDesc: "This scope lets Vellu create, update, and delete events in your calendar. Vellu cannot read other events in your calendar, and has no access to any calendars other than the one you connect.",
    stepsTitle: "What happens on each action?",
    steps: [
      { icon: "plus", title: "New booking", body: "A customer books an appointment via your Vellu page. Vellu immediately creates an event in your Google Calendar with the customer's name, the service, the time, and the duration." },
      { icon: "edit", title: "Booking changed", body: "If a customer reschedules or you edit the appointment in the dashboard, Vellu updates the corresponding event — one-to-one, no duplicates." },
      { icon: "xmark", title: "Booking cancelled", body: "On cancellation, Vellu automatically deletes the event so your calendar stays accurate." },
    ],
    limitedUseTitle: "Limited Use statement",
    limitedUseBody: "Vellu's use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Specifically:",
    limitedUseBullets: [
      "We use your Google data solely to provide the salon features described above.",
      "We never sell or trade your Google data.",
      "We never share your Google data for advertising or targeting.",
      "We do not train AI models on your Google data.",
      "Human access to your Google data is allowed only with explicit consent, for security investigations, or where legally required.",
    ],
    disconnectTitle: "How to disconnect",
    disconnectBody: "You can revoke access two ways. Both take effect immediately: existing events stay in your calendar, but no new events will be created.",
    disconnectSteps: [
      "In Vellu: Settings → Other → Google Calendar → 'Disconnect'.",
      "On Google: myaccount.google.com/permissions → find Vellu → 'Remove access'.",
    ],
    moreTitle: "More information",
    moreBody: "For a full account of how we handle personal data and your rights under GDPR, see our privacy policy.",
    privacyLabel: "Read our privacy policy →",
  };

  return (
    <Layout>
      <div style={{ background: c.bg, minHeight: "100dvh", fontFamily: "'Jost',sans-serif", color: c.text, padding: "40px 24px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { if (window.history.length > 1) navigate(-1); else navigate("/"); }}>← {t.back}</button>
            <div style={{ display: "flex", gap: 8 }}><ThemeToggle /><LangToggle lang={lang} setLang={setLang} /></div>
          </div>

          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, marginBottom: 6 }}>{content.title}</div>
          <div style={{ fontSize: 13, color: c.textSub, marginBottom: 4, lineHeight: 1.5 }}>{content.subtitle}</div>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 28 }}>{content.updated}</div>

          {/* Overview card */}
          <div style={{ fontSize: 14, color: c.textSub, lineHeight: 1.7, marginBottom: 28, padding: "18px 20px", background: `${ACCENT}08`, border: `1px solid ${ACCENT}1a`, borderRadius: 16 }}>{content.overview}</div>

          {/* Scope block */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{content.scopeTitle}</div>
            <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.textLabel, marginBottom: 6 }}>OAuth scope</div>
              <div style={{ fontFamily: "'Courier New',monospace", fontSize: 12, color: c.text, wordBreak: "break-all" }}>{content.scopeName}</div>
            </div>
            <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7 }}>{content.scopeDesc}</div>
          </div>

          {/* What happens on each action */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{content.stepsTitle}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {content.steps.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 14, padding: "14px 16px", background: c.bgCard, border: "1px solid " + c.border, borderRadius: 14 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${ACCENT}15`, color: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <NavIcon name={s.icon} size={14} color={ACCENT} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 4 }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.6 }}>{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Limited Use — required on a Google-verification-ready page */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{content.limitedUseTitle}</div>
            <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7, marginBottom: 10 }}>{content.limitedUseBody}</div>
            <ul style={{ fontSize: 13, color: c.textSub, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
              {content.limitedUseBullets.map((b, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{b}</li>
              ))}
            </ul>
          </div>

          {/* Disconnect */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{content.disconnectTitle}</div>
            <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7, marginBottom: 10 }}>{content.disconnectBody}</div>
            <ul style={{ fontSize: 13, color: c.textSub, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
              {content.disconnectSteps.map((s, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{s}</li>
              ))}
            </ul>
          </div>

          {/* Pointer to privacy policy */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{content.moreTitle}</div>
            <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.7, marginBottom: 8 }}>{content.moreBody}</div>
            <a href="/privacy" style={{ fontSize: 13, color: ACCENT, textDecoration: "none", fontWeight: 500 }}>{content.privacyLabel}</a>
          </div>

          <div style={{ paddingTop: 20, borderTop: "1px solid " + c.border, display: "flex", gap: 16, fontSize: 11, color: c.textMuted }}>
            <a href="/privacy" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Privacybeleid" : "Privacy Policy"}</a>
            <a href="/terms" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{t.terms}</a>
            <a href="/" style={{ color: c.textMuted, textDecoration: "none", borderBottom: "1px solid " + c.border }}>{lang === "nl" ? "Terug naar home" : "Back to home"}</a>
          </div>
        </div>
      </div>
    </Layout>
  );
}


export { PrivacyPage, TermsPage, ContactPage, DpaPage, GoogleIntegrationPage };
export default PrivacyPage;
