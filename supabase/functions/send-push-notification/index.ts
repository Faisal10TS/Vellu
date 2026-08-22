// send-push-notification — web-push (RFC 8291/8292) naar de browser/PWA van
// een Vellu-gebruiker (eigenaar; later ook medewerker).
//
// Aangeroepen door:
//   - book-appointment / cancel-appointment: server-to-server met
//     x-internal-secret (= service role key), net als send-emails.
//   - de testknop in Instellingen → Planning → "Meldingen op je telefoon":
//     supabase.functions.invoke met de sessie-JWT; dan moet body.user_id de
//     aanroeper zélf zijn. Zo kan niemand andermans telefoon laten piepen.
//
// Abonnementen staan in push_subscriptions (RLS: eigen rijen; wij lezen met de
// service role). Een push-dienst die 404/410 teruggeeft ("gone": browserdata
// gewist, app verwijderd) → rij direct opruimen, anders blijven we er eeuwig
// tegenaan duwen.
//
// Sleutels: VAPID_KEYS_JWK (secret, JSON {publicKey, privateKey} als JWK) +
// VAPID_SUBJECT (mailto:). De bijbehorende publieke sleutel staat in
// src/shared.jsx (VAPID_PUBLIC_KEY). Nieuwe sleutels = alle abonnementen weg.
//
// Bibliotheek: @negrel/webpush — puur WebCrypto, gemaakt voor Deno, dus geen
// Node-compat-gok zoals npm:web-push in de edge runtime.
//
// TOEGANG: verify_jwt=false (config.toml), want de interne aanroepen hebben
// geen gebruikers-JWT; de autorisatie hierboven vervangt dat.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_KEYS_JWK = Deno.env.get("VAPID_KEYS_JWK") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:mirahventures@vellu.cc";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const ALLOWED_ORIGINS = ["https://vellu.cc", "https://www.vellu.cc", "https://vellu.io", "https://www.vellu.io", "http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176"];
function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "https://vellu.cc";
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret", "Vary": "Origin" };
}
const json = (status: number, body: unknown, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });

// Eén ApplicationServer per instance: sleutelimport is niet gratis.
let appServerPromise: Promise<webpush.ApplicationServer> | null = null;
function getAppServer() {
  if (!appServerPromise) {
    appServerPromise = (async () => {
      if (!VAPID_KEYS_JWK) throw new Error("VAPID_KEYS_JWK secret ontbreekt");
      const vapidKeys = await webpush.importVapidKeys(JSON.parse(VAPID_KEYS_JWK), { extractable: false });
      return webpush.ApplicationServer.new({ contactInformation: VAPID_SUBJECT, vapidKeys });
    })();
    // Een mislukte import niet cachen, anders blijft de functie kapot tot herstart.
    appServerPromise.catch(() => { appServerPromise = null; });
  }
  return appServerPromise;
}

type Body = { user_id?: string; title?: string; body?: string; url?: string; tag?: string; ttl?: number };

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }, origin); }
  const userId = String(body.user_id || "").trim();
  if (!userId) return json(400, { error: "user_id_required" }, origin);

  // Autorisatie: intern geheim, óf de gebruiker zelf (testknop).
  const internal = req.headers.get("x-internal-secret") === SUPABASE_SERVICE_KEY;
  if (!internal) {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const { data: caller } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } };
    if (!caller?.user || caller.user.id !== userId) return json(401, { error: "unauthorized" }, origin);
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh_key, auth_key")
    .eq("user_id", userId);
  if (error) return json(500, { error: error.message }, origin);
  if (!subs || subs.length === 0) return json(200, { sent: 0, removed: 0, subscriptions: 0 }, origin);

  let appServer: webpush.ApplicationServer;
  try { appServer = await getAppServer(); } catch (e) {
    console.error("push: VAPID init failed:", e);
    return json(500, { error: "vapid_init_failed" }, origin);
  }

  const payload = JSON.stringify({
    title: String(body.title || "Vellu").slice(0, 120),
    body: String(body.body || "").slice(0, 400),
    url: String(body.url || "/owner").slice(0, 300),
    tag: body.tag ? String(body.tag).slice(0, 120) : undefined,
  });
  const ttl = Math.min(Math.max(Number(body.ttl) || 86400, 60), 7 * 86400);

  let sent = 0, removed = 0;
  const failures: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      const subscriber = appServer.subscribe({ endpoint: s.endpoint, keys: { auth: s.auth_key, p256dh: s.p256dh_key } });
      await subscriber.pushTextMessage(payload, { ttl });
      sent++;
      await supabase.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      const status = (e as { response?: Response })?.response?.status;
      if (status === 404 || status === 410) {
        // Abonnement bestaat niet meer bij de push-dienst → opruimen.
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
        removed++;
      } else {
        failures.push(`${s.id}: ${String(e).slice(0, 160)}`);
        console.error("push failed:", s.id, status, String(e).slice(0, 300));
      }
    }
  }));

  return json(200, { sent, removed, subscriptions: subs.length, failures }, origin);
});
