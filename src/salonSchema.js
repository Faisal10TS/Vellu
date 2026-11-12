// Gestructureerde gegevens (schema.org, JSON-LD) voor de boekingspagina van
// een salon, plus het opschonen van plaats en adres.
//
// WAAROM (boekingspagina-ronde 11/12-11-2026, punt 7)
// Google zag op vellu.cc/<salon> alleen titel en beschrijving. Met een
// BeautySalon-blok weet Google ook adres, openingstijden, telefoon, prijsbereik
// en de beoordeling: de gegevens die het bij een zoekresultaat of op de kaart
// kan tonen. ALLES wat hier staat, staat ook zichtbaar op de pagina (dat eist
// Google): de bouwer krijgt de uren zoals de urenkaart ze toont, de prijzen
// zoals de dienstenlijst ze toont, enzovoort.
//
// Geen JSX en geen imports: ook te gebruiken (en te testen) buiten React.

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// Plaats en adres zoals de salon ze intypte, netjes gemaakt.
// - Spaties eromheen weg: "Kralendijk " gaf "in Kralendijk ." in de
//   beschrijving die Google toont.
// - Komma's krijgen één spatie: "Bonaire,Kralendijk" → "Bonaire, Kralendijk".
// - Een stuk met een cijfer erin is een straat of postcode, geen plaats.
//   "Volmerlaan 11, Rijswijk" (Rioghna) stond zo bovenaan de pagina als
//   plaatsnaam. Is het adresveld leeg, dan verhuist dat stuk naar het adres:
//   de kaart en het adresblok krijgen dus nog steeds alles, bovenaan staat
//   alleen "Rijswijk". Bestaat het plaatsveld alleen uit cijferstukken, dan
//   blijft het zoals het was (liever iets dan niets).
export function splitPlace(city, address) {
  const parts = String(city ?? "").split(",").map(clean).filter(Boolean);
  let addr = clean(address);
  const town = parts.filter((p) => !/\d/.test(p));
  if (!town.length) return { city: parts.join(", "), address: addr };
  const street = parts.filter((p) => /\d/.test(p));
  if (street.length && !addr) addr = street.join(", ");
  return { city: town.join(", "), address: addr };
}

// Openingstijden per weekdag (0 = zondag, zoals overal in Vellu) naar
// OpeningHoursSpecification. Dagen met dezelfde tijden worden samengevoegd;
// een middagpauze wordt twee blokken, net als "09:00 – 12:00 & 13:00 – 17:00"
// op de pagina. Een dag zonder geldige tijden laten we weg (= dicht).
export function openingHoursSpec(weekly) {
  const groups = new Map();
  for (let d = 0; d < 7; d++) {
    const h = weekly?.[d];
    if (!h || h.closed || !HHMM.test(h.open || "") || !HHMM.test(h.close || "") || h.open >= h.close) continue;
    const blocks = (h.break_start && h.break_end && HHMM.test(h.break_start) && HHMM.test(h.break_end)
      && h.open < h.break_start && h.break_start < h.break_end && h.break_end < h.close)
      ? [[h.open, h.break_start], [h.break_end, h.close]]
      : [[h.open, h.close]];
    for (const [opens, closes] of blocks) {
      const key = `${opens}-${closes}`;
      if (!groups.has(key)) groups.set(key, { opens, closes, days: [] });
      groups.get(key).days.push(d);
    }
  }
  // Maandag eerst, zoals de urenkaart.
  const order = (d) => (d + 6) % 7;
  return [...groups.values()]
    .sort((a, b) => order(a.days[0]) - order(b.days[0]) || a.opens.localeCompare(b.opens))
    .map((g) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: g.days.sort((a, b) => order(a) - order(b)).map((d) => DAY_NAMES[d]),
      opens: g.opens,
      closes: g.closes,
    }));
}

// Het blok zelf. Velden zonder waarde blijven weg (geen lege strings).
//   salon: { name, url, city, address, countryCode, phone, email, instagram,
//            coverUrl, logoUrl }
//   weekly: 7 dagen uren, zoals de urenkaart ze toont
//   rating: { value, count } of null
//   priceRange: tekst zoals "$35,00 – $85,00" of ""
export function salonJsonLd({ salon, weekly, rating, priceRange }) {
  const s = salon || {};
  const url = clean(s.url);
  const out = {
    "@context": "https://schema.org",
    "@type": "BeautySalon",
    // Namen en adressen soms in "𝐯𝐞𝐭𝐭𝐞" Unicode-letters (Beauty By Eydy):
    // NFKC maakt er gewone letters van, zodat Google ze kan lezen.
    name: clean(String(s.name || "").normalize("NFKC")),
  };
  if (url) { out["@id"] = `${url}#salon`; out.url = url; }
  const images = [s.coverUrl, s.logoUrl].filter((u) => typeof u === "string" && /^https:\/\//.test(u));
  if (images.length) out.image = images;
  if (typeof s.logoUrl === "string" && /^https:\/\//.test(s.logoUrl)) out.logo = s.logoUrl;
  const street = clean(String(s.address || "").normalize("NFKC"));
  // "Nederland" is het invulsel van de app als er geen plaats is: geen plaats.
  let locality = clean(String(s.city || "").normalize("NFKC"));
  if (/^(nederland|netherlands|the netherlands|holland)$/i.test(locality)) locality = "";
  const country = /^[A-Z]{2}$/.test(String(s.countryCode || "")) ? s.countryCode : "";
  if (street || locality || country) {
    out.address = { "@type": "PostalAddress" };
    if (street) out.address.streetAddress = street;
    if (locality) out.address.addressLocality = locality;
    if (country) out.address.addressCountry = country;
  }
  if (clean(s.phone)) out.telephone = clean(s.phone);
  if (clean(s.email)) out.email = clean(s.email);
  const hours = openingHoursSpec(weekly);
  if (hours.length) out.openingHoursSpecification = hours;
  if (clean(priceRange) && clean(priceRange).length < 100) out.priceRange = clean(priceRange);
  if (rating && Number(rating.count) > 0 && Number(rating.value) > 0) {
    out.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(Number(rating.value).toFixed(1)),
      reviewCount: Number(rating.count),
      bestRating: 5,
      worstRating: 1,
    };
  }
  const ig = clean(s.instagram).replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
  if (/^[A-Za-z0-9._]{1,30}$/.test(ig)) out.sameAs = [`https://www.instagram.com/${ig}`];
  return out;
}

// Veilig in een <script>-tag: "</script>" in een salonnaam mag de tag niet
// afsluiten, en U+2028/2029 breken oudere parsers.
export function jsonLdText(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .split(String.fromCharCode(0x2028)).join("\\u2028")
    .split(String.fromCharCode(0x2029)).join("\\u2029");
}
