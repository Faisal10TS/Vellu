// google-auth: UITGEZET op 05-10-2026 (audit 05-10-2026).
//
// De vorige versie (v14, zie de vorige commit van dit bestand) koppelde een
// Google-account aan een salon zonder te controleren wie dat vroeg. POST
// {action:"get_url", owner_id} zette het owner_id uit de body rechtstreeks in de
// OAuth-state, en de callback schreef het refresh-token op het profiel met dat
// id. Wie het (openbare) id van een salon kende, kon zo zijn EIGEN Google-account
// aan die salon hangen, en google-calendar zette daarna elke nieuwe boeking van
// die salon, met naam, e-mail en telefoon van de klant, in zijn agenda.
// "disconnect" had evenmin een controle. Op 05-10-2026 had geen enkele salon de
// koppeling aan (0 tokens), dus uitzetten kost niemand iets; de app wijst nu
// naar "Agenda in je telefoon" (calendar-feed).
//
// Weer aanzetten kan pas met:
// 1. een gebruikers-JWT verplicht voor get_url en disconnect, en owner_id = het
//    uid uit dat token (nooit uit de body);
// 2. een ondertekende, kortlevende state (HMAC over uid + nonce + verloop) die
//    de callback controleert vóór hij iets schrijft;
// 3. google-calendar alleen nog server-side aanroepen (x-internal-secret), of
//    met een JWT die bij het owner_id hoort.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://vellu.cc",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
};

serve((req) => {
  const url = new URL(req.url);
  // Een terugkeer van Google uit een koppeling die vóór het uitzetten begon (ook
  // als de eigenaar daar op Annuleren drukte: dan komt er ?error= terug):
  // netjes terug naar de app, zonder iets op te slaan.
  const q = url.searchParams;
  if (req.method === "GET" && (q.has("code") || q.has("error") || q.has("state"))) {
    return Response.redirect("https://vellu.cc/owner", 302);
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: HEADERS });
  return new Response(JSON.stringify({ error: "google_calendar_disabled" }), { status: 410, headers: HEADERS });
});
