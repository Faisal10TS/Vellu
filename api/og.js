// api/og.js — linkvoorbeeld van een salonpagina voor WhatsApp, Facebook,
// Instagram-DM's, Slack enzovoort (L3-14).
//
// WAAROM
// Linkvoorbeeld-bots draaien geen JavaScript. Ze zagen voor vellu.cc/<salon>
// alleen de vaste tags uit index.html ("Vellu - Jouw salon. Jouw regels."),
// want de salonnaam en -foto zet de app pas in de browser (useSEO).
//
// HOE
// vercel.json herschrijft /:slug naar deze functie ALLEEN als de user-agent
// een bekende linkvoorbeeld-bot is. Mensen krijgen gewoon de SPA. Deze functie
// haalt de echte index.html van dezelfde site op en vervangt daarin titel,
// beschrijving, canonical en de og:/twitter:-tags door die van de salon. Er
// is dus geen doorverwijzing: komt er toch een mens langs met zo'n
// user-agent, dan laadt de gewone app (geen lus). Onbekende salon, Vellu's
// eigen pagina's (/owner, /privacy, ...) of een storing: index.html
// ongewijzigd, precies zoals nu.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://pqvovkwqkapmpibktpwb.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY || 'sb_publishable_9a56u0YAwjJFjeQ6AGpJeg_qrzPnl0k';
const SLUG_RE = /^[a-z0-9-]{1,80}$/;
// Zelfde markten als de app (ownerLangFor): daar is de pagina Nederlands.
const NL_MARKETS = new Set(['NL', 'BE', 'AW', 'CW', 'SX', 'BQ']);
// Spaanstalige markten: vandaag alleen Spanje (COUNTRIES in shared.jsx);
// uitbreiden als er Spaanstalige landen bijkomen. De rest krijgt Engels.
const ES_MARKETS = new Set(['ES']);
const OG_LOCALES = { nl: 'nl_NL', en: 'en_US', es: 'es_ES' };

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function shellUrl(req) {
  // Alleen onze eigen domeinen (en Vercel-previews); nooit een willekeurige
  // Host-header volgen.
  const h = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  const host = (h === 'vellu.cc' || h === 'www.vellu.cc' || /^[a-z0-9-]+\.vercel\.app$/.test(h)) ? h : 'vellu.cc';
  return `https://${host}/index.html`;
}

async function loadShell(req) {
  try {
    const r = await fetch(shellUrl(req), { headers: { 'user-agent': 'vellu-og-shell' } });
    if (!r.ok) return null;
    const html = await r.text();
    return html.includes('<div id="root">') ? html : null;
  } catch { return null; }
}

async function loadSalon(slug) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/public_salons?select=business_name,city,country_code,cover_image_url,logo_url&slug=eq.${encodeURIComponent(slug)}&limit=1`;
    const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch { return null; }
}

function metaFor(salon, slug) {
  const name = String(salon.business_name || '').trim() || 'Salon';
  const city = String(salon.city || '').split(',').pop().trim();
  const cc = salon.country_code || 'NL';
  const lang = NL_MARKETS.has(cc) ? 'nl' : ES_MARKETS.has(cc) ? 'es' : 'en';
  const description = lang === 'nl'
    ? `Boek een afspraak bij ${name}${city ? ` in ${city}` : ''}. Online boeken, geen commissie.`
    : lang === 'es'
    ? `Reserva una cita en ${name}${city ? ` en ${city}` : ''}. Reserva online, sin comisiones.`
    : `Book an appointment at ${name}${city ? ` in ${city}` : ''}. Book online, no commission.`;
  const img = [salon.cover_image_url, salon.logo_url].find((u) => typeof u === 'string' && /^https:\/\//.test(u)) || '';
  return { title: `${name} | Vellu`, description, url: `https://vellu.cc/${slug}`, image: img, lang };
}

// og:locale volgt de taal van de beschrijving; de andere twee talen van de
// pagina (taalkeuze bovenaan) staan als alternatief.
function localeTags(lang) {
  const main = OG_LOCALES[lang] || OG_LOCALES.nl;
  return [`<meta property="og:locale" content="${main}" />`]
    .concat(Object.values(OG_LOCALES).filter((v) => v !== main).map((v) => `<meta property="og:locale:alternate" content="${v}" />`));
}

// Vervangt een bestaande tag of voegt hem vóór </head> toe. Met een functie
// als vervanging, zodat een "$" in een salonnaam niets betekent.
function setTag(html, re, tag) {
  if (re.test(html)) return html.replace(re, () => tag);
  return html.replace('</head>', () => `  ${tag}\n  </head>`);
}

function inject(html, m) {
  let out = html;
  out = setTag(out, /<title>[\s\S]*?<\/title>/i, `<title>${esc(m.title)}</title>`);
  out = setTag(out, /<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(m.description)}" />`);
  out = setTag(out, /<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(m.url)}" />`);
  out = setTag(out, /<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${esc(m.url)}" />`);
  out = setTag(out, /<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${esc(m.title)}" />`);
  out = setTag(out, /<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${esc(m.description)}" />`);
  out = setTag(out, /<meta\s+name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${esc(m.title)}" />`);
  out = setTag(out, /<meta\s+name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${esc(m.description)}" />`);
  // Eerst de oude alternatieven weg, dan staat alleen og:locale zelf nog.
  out = out.replace(/\s*<meta\s+property="og:locale:alternate"[^>]*>/gi, '');
  out = setTag(out, /<meta\s+property="og:locale"[^>]*>/i, localeTags(m.lang).join('\n    '));
  out = out.replace(/<html\s+lang="[^"]*"/i, () => `<html lang="${m.lang}"`);
  if (m.image) {
    out = setTag(out, /<meta\s+property="og:image"\s[^>]*>/i, `<meta property="og:image" content="${esc(m.image)}" />`);
    out = setTag(out, /<meta\s+name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${esc(m.image)}" />`);
    // De vaste afmetingen horen bij og-image.png, niet bij de salonfoto.
    out = out.replace(/\s*<meta\s+property="og:image:(?:width|height)"[^>]*>/gi, '');
  }
  return out;
}

function minimal(m) {
  // Alleen als index.html zelf niet te halen was: kale tags plus een gewone
  // link (geen automatische doorverwijzing).
  const t = m ? m.title : 'Vellu';
  const d = m ? m.description : '';
  const u = m ? m.url : 'https://vellu.cc/';
  const lang = (m && m.lang) || 'nl';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${esc(t)}</title>
<meta name="description" content="${esc(d)}">
<link rel="canonical" href="${esc(u)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Vellu">
${localeTags(lang).join('\n')}
<meta property="og:url" content="${esc(u)}">
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(d)}">
<meta property="og:image" content="${esc((m && m.image) || 'https://vellu.cc/og-image.png')}">
</head>
<body><a href="${esc(u)}">${esc(t)}</a></body>
</html>`;
}

export default async function handler(req, res) {
  const slug = String((req.query && req.query.slug) || '');
  const [shell, salon] = await Promise.all([
    loadShell(req),
    SLUG_RE.test(slug) ? loadSalon(slug) : Promise.resolve(null),
  ]);
  const m = salon ? metaFor(salon, slug) : null;
  const html = shell ? (m ? inject(shell, m) : shell) : minimal(m);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Kort in de CDN: een nieuwe salonfoto staat binnen tien minuten in het
  // voorbeeld. De browser zelf bewaart niets (zelfde als index.html).
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
  res.status(200).send(html);
}
