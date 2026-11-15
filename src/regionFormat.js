// Regio-opmaak (VS fase 2, 15-11-2026).
//
// Alleen een salon in de Verenigde Staten (country_code "US") schrijft
// Amerikaans: $1,234.50, 2:30 PM, 11/19/2026 en "Thursday, November 19".
// Elk ander land houdt de Vellu-schrijfwijze, ook Bonaire met de dollar
// (Faisal 24-09-2026: "everywhere a , instead of a ."): $1.234,50, 14:30,
// dag eerst. De TAAL bepaalt de woorden, het LAND de volgorde, de klok en de
// komma.
//
// Geen afhankelijkheden: shared.jsx (de apps), de rapporten (PDF/Excel) en de
// tests gebruiken dezelfde regels. De edge-functies hebben een kopie
// (usFmt-helpers); samen wijzigen.

export const isUsCountry = (cc) => String(cc || "").toUpperCase() === "US";

// Locale voor toLocaleDateString/toLocaleString. Buiten de VS precies wat de
// apps al gebruikten (nl-NL / es-ES / en-GB).
export function dateLocaleFor(lang, cc) {
  if (isUsCountry(cc)) return lang === "nl" ? "nl-NL" : lang === "es" ? "es-US" : "en-US";
  return lang === "nl" ? "nl-NL" : lang === "es" ? "es-ES" : "en-GB";
}

// Locale voor bedragen in de rapporten en fmtMoney: VS "1,234.50", anders "1.234,50".
export const moneyLocaleFor = (cc) => (isUsCountry(cc) ? "en-US" : "nl-NL");

// Bedrag met symbool. VS: "$1,234.50" en "-$12.50"; anders "€1.234,50" en
// "€-12,50" (de bestaande fmtAmt-vorm, ongewijzigd).
export function amountLabel(sym, n, cc) {
  const v = Number(n) || 0;
  const [int, dec] = Math.abs(v).toFixed(2).split(".");
  const neg = v < 0 && Number(Math.abs(v).toFixed(2)) !== 0;
  if (isUsCountry(cc)) return (neg ? "-" : "") + (sym || "") + int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + dec;
  return (sym || "") + (neg ? "-" : "") + int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
}

// Kloktijd "14:30" (of "9:00", "14:30:00") → VS "2:30 PM", anders ongewijzigd.
// 12:00 = "12:00 PM", 00:00 en 24:00 = "12:00 AM". Alles wat geen kloktijd is
// gaat ongewijzigd door, zodat dubbel opmaken niets kapotmaakt.
export function timeLabel(hm, cc) {
  const s = hm == null ? "" : String(hm);
  if (!isUsCountry(cc)) return s;
  const m = /^\s*(\d{1,2})[:.](\d{2})(?::\d{2})?\s*$/.exec(s);
  if (!m) return s;
  const h = Number(m[1]);
  if (h > 24 || Number(m[2]) > 59) return s;
  const h12 = h % 12 || 12;
  return `${h12}:${m[2]} ${h >= 12 && h < 24 ? "PM" : "AM"}`;
}

// Kloktijden IN een tekst ("10:00 – 17:30", "om 9:00") → VS 12-uurs. Alleen
// losse HH:MM die niet al door AM/PM gevolgd worden. Anders ongewijzigd.
export function timesInText(text, cc) {
  const s = text == null ? "" : String(text);
  if (!isUsCountry(cc)) return s;
  return s.replace(/(^|[^\d:.,/])([01]?\d|2[0-4]):([0-5]\d)(?![\d:]|\s?[AaPp]\.?\s?[Mm]\b)/g, (all, pre, h, mm) => pre + timeLabel(`${h}:${mm}`, cc));
}

// Datum als cijfers. "2026-11-19" → VS "11/19/2026" (zonder jaar "11/19"),
// anders "19-11-2026" ("19-11"). Een Date mag ook.
export function numDateLabel(d, cc, withYear = true) {
  let y, mo, day;
  if (d instanceof Date) { y = d.getFullYear(); mo = d.getMonth() + 1; day = d.getDate(); }
  else {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
    if (!m) return String(d || "");
    y = Number(m[1]); mo = Number(m[2]); day = Number(m[3]);
  }
  if (isUsCountry(cc)) return withYear ? `${mo}/${day}/${y}` : `${mo}/${day}`;
  const dd = String(day).padStart(2, "0"), mm = String(mo).padStart(2, "0");
  return withYear ? `${dd}-${mm}-${y}` : `${dd}-${mm}`;
}
