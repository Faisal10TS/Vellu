// api/unsubscribe.js — afmelden voor de nieuwsbrief van een salon (E2-08).
//
// send-newsletter zet per ontvanger een rij in newsletter_opt_outs met een
// willekeurig token (32 bytes hex) en zet deze link in de voettekst en in de
// kop List-Unsubscribe: https://vellu.cc/api/unsubscribe?t=<token>. Geen
// e-mailadres in de URL; het token is de enige sleutel.
//
// GET  toont een korte pagina met één knop "Afmelden". Bewust geen afmelding
//      op GET: virusscanners en linkcontroles van mailprogramma's openen elke
//      link uit een mail alvast, en dan zou iedereen zonder het te weten
//      afgemeld raken.
// POST zet opted_out_at (alleen als die nog leeg is). Komt het verzoek van
//      onze eigen knop, dan volgt een bevestigingspagina; een one-click POST
//      van het mailprogramma (RFC 8058, List-Unsubscribe=One-Click) krijgt een
//      lege 200.
//
// Altijd hetzelfde antwoord, of het token nu bestaat of niet: deze URL
// verraadt niet welke tokens geldig zijn. Pagina in drie talen onder elkaar,
// want we weten niet welke taal de ontvanger leest.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://pqvovkwqkapmpibktpwb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN_RE = /^[0-9a-f]{64}$/;

function page(res, status, blocks, form) {
  const body = blocks.map(([lang, title, text]) => `
    <section lang="${lang}">
      <h1>${title}</h1>
      <p>${text}</p>
    </section>`).join('');
  const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Nieuwsbrief | Newsletter | Boletín</title>
<style>
  body { margin: 0; background: #F4EFE6; color: #5B4C3A; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  main { max-width: 440px; margin: 0 auto; padding: 48px 20px; }
  section { padding: 18px 0; border-bottom: 1px solid #DED1BA; }
  section:last-of-type { border-bottom: none; }
  h1 { font-size: 19px; font-weight: 600; margin: 0 0 6px; }
  p { font-size: 14px; line-height: 1.6; margin: 0; color: #6b5c48; }
  form { margin-top: 24px; }
  button { width: 100%; padding: 14px 18px; border: 1px solid #5B4C3A; border-radius: 8px; background: #5B4C3A; color: #F4EFE6; font-size: 14px; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
<main>${body}${form || ''}
</main>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(html);
}

const INVALID = [
  ['nl', 'Link niet geldig', 'Deze afmeldlink klopt niet. Gebruik de link onderaan de nieuwsbrief, of beantwoord de mail.'],
  ['en', 'Link not valid', 'This unsubscribe link is not valid. Use the link at the bottom of the newsletter, or reply to the email.'],
  ['es', 'Enlace no válido', 'Este enlace para darte de baja no es válido. Usa el enlace al final del boletín o responde al correo.'],
];
const CONFIRM = [
  ['nl', 'Afmelden voor de nieuwsbrief', 'Wil je de nieuwsbrief van deze salon niet meer ontvangen? Bevestig hieronder. Mails over je afspraken blijven gewoon komen.'],
  ['en', 'Unsubscribe from the newsletter', 'No longer want this salon\'s newsletter? Confirm below. Emails about your appointments will still arrive.'],
  ['es', 'Darse de baja del boletín', '¿Ya no quieres recibir el boletín de este salón? Confírmalo abajo. Los correos sobre tus citas seguirán llegando.'],
];
const DONE = [
  ['nl', 'Je bent afgemeld', 'Je bent afgemeld voor de nieuwsbrief van deze salon.'],
  ['en', 'You are unsubscribed', 'You have been unsubscribed from this salon\'s newsletter.'],
  ['es', 'Te has dado de baja', 'Te has dado de baja del boletín de este salón.'],
];
const FAILED = [
  ['nl', 'Dat lukte niet', 'Afmelden lukte nu niet. Probeer het later opnieuw, of beantwoord de mail.'],
  ['en', 'That did not work', 'We could not unsubscribe you right now. Please try again later, or reply to the email.'],
  ['es', 'No ha funcionado', 'No hemos podido darte de baja ahora. Inténtalo más tarde o responde al correo.'],
];

async function optOut(token) {
  const url = `${SUPABASE_URL}/rest/v1/newsletter_opt_outs?token=eq.${token}&opted_out_at=is.null`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ opted_out_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`opt-out failed: HTTP ${r.status}`);
}

export default async function handler(req, res) {
  const token = String((req.query && req.query.t) || '');
  const valid = TOKEN_RE.test(token);

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!valid) return page(res, 400, INVALID);
    const form = `
  <form method="post" action="/api/unsubscribe?t=${token}">
    <input type="hidden" name="confirm" value="1">
    <button type="submit">Afmelden &middot; Unsubscribe &middot; Darse de baja</button>
  </form>`;
    return page(res, 200, CONFIRM, form);
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }

  // Onze eigen knop stuurt confirm=1; al het andere (de one-click POST van
  // het mailprogramma) krijgt een leeg antwoord.
  let fromPage = false;
  try { fromPage = !!(req.body && typeof req.body === 'object' && req.body.confirm === '1'); } catch { fromPage = false; }

  res.setHeader('Cache-Control', 'no-store');
  if (!valid) return fromPage ? page(res, 400, INVALID) : res.status(400).end();
  try {
    await optOut(token);
  } catch (err) {
    console.error('unsubscribe:', err);
    return fromPage ? page(res, 500, FAILED) : res.status(500).end();
  }
  return fromPage ? page(res, 200, DONE) : res.status(200).end();
}
