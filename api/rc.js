// api/rc.js — terugkerende klant onthouden op de boekingspagina (17-11-2026).
//
// Waarom een cookie van de server: de boekingspagina onthield naam, e-mail en
// telefoon alleen in localStorage. WebKit (Safari op iPhone/iPad en elke
// iOS-browser, ook die in Instagram) wist door scripts geschreven opslag na
// een aantal dagen browsergebruik zonder bezoek aan de site: 30 in recente
// WebKit, 7 als de bezoeker binnenkwam via een link met tracking-parameters
// van een site die WebKit als tracker ziet (bijv. Instagram met fbclid), en 7
// in oudere iOS-versies. Een cookie die de SERVER zet (Set-Cookie) valt daar
// niet onder (alleen document.cookie-cookies worden ingekort).
// Regio: vercel.json zet deze functie in dub1 (EU), want hij verwerkt
// persoonsgegevens en de privacyverklaring noemt EU-datacenters.
//
// Privacy: er is geen opzoeking. Deze functie leest alleen de cookie die de
// browser zelf meestuurt, dus elk toestel krijgt uitsluitend zijn eigen
// gegevens terug. HttpOnly (geen script kan hem lezen), Path=/api/rc (gaat
// alleen naar deze functie mee), geen CORS (andere sites kunnen het antwoord
// niet lezen), en schrijven alleen vanaf onze eigen pagina (Origin-check).
//
// GET  /api/rc?s=<slug>              -> { client: {firstName,lastName,email,phone} | null }
// POST /api/rc { s, firstName, lastName, email, phone }   -> 204, cookie 1 jaar
// POST /api/rc { s, forget: true }                         -> 204, cookie weg
//
// s = de slug van de salon (in ClientApp heet die salon.id). Eén cookie per
// salon: vrc_<slug>.

import { Buffer } from "node:buffer";

// Alles wat het slug-veld in de app toelaat (kleine letters, cijfers, '-').
const SLUG_RE = /^[a-z0-9-]{1,80}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AGE = 60 * 60 * 24 * 365;

const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const cookieName = (slug) => `vrc_${slug.toLowerCase()}`;

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function decode(value) {
  try {
    const o = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const client = {
      firstName: clean(o.f, 80), lastName: clean(o.l, 80),
      email: clean(o.e, 254).toLowerCase(), phone: clean(o.p, 40),
    };
    return client.firstName && EMAIL_RE.test(client.email) ? client : null;
  } catch { return null; }
}

function setCookie(res, name, value, maxAge) {
  res.setHeader("Set-Cookie", `${name}=${value}; Path=/api/rc; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
}

// Alleen onze eigen pagina mag schrijven: Origin moet dezelfde host zijn als
// waar deze functie draait (www.vellu.cc, vellu.cc, een preview of localhost).
function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!origin || !host) return false;
  try { return new URL(origin).host === String(host).split(",")[0].trim(); } catch { return false; }
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");

  if (req.method === "GET") {
    if (req.headers["sec-fetch-site"] === "cross-site") return res.status(403).end();
    const slug = String((req.query && req.query.s) || "");
    if (!SLUG_RE.test(slug)) return res.status(400).json({ client: null });
    const value = readCookie(req, cookieName(slug));
    return res.status(200).json({ client: value ? decode(value) : null });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== "object") return res.status(400).end();
  const slug = String(body.s || "");
  if (!SLUG_RE.test(slug)) return res.status(400).end();
  const name = cookieName(slug);

  if (body.forget === true) {
    setCookie(res, name, "", 0);
    return res.status(204).end();
  }

  const f = clean(body.firstName, 80), e = clean(body.email, 254).toLowerCase();
  if (!f || !EMAIL_RE.test(e)) return res.status(400).end();
  const value = Buffer.from(JSON.stringify({ f, l: clean(body.lastName, 80), e, p: clean(body.phone, 40) }), "utf8").toString("base64url");
  setCookie(res, name, value, MAX_AGE);
  return res.status(204).end();
}
