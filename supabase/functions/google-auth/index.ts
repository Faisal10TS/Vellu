import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-auth`;
 
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
 
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
 
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
 
  // ─── CALLBACK: Google redirects here with code ───
  if (code && state) {
    try {
      const ownerId = state;
 
      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
 
      const tokens = await tokenRes.json();
 
      if (tokens.error) {
        console.error("Token error:", tokens);
        return Response.redirect("https://vellu.cc/owner?google=error", 302);
      }
 
      // Store refresh token in profiles
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from("profiles").update({
        google_refresh_token: tokens.refresh_token,
        google_calendar_connected: true,
      }).eq("id", ownerId);
 
      return Response.redirect("https://vellu.cc/owner?google=connected", 302);
    } catch (e) {
      console.error("Callback error:", e);
      return Response.redirect("https://vellu.cc/owner?google=error", 302);
    }
  }
 
  // ─── POST: Generate auth URL or disconnect ───
  if (req.method === "POST") {
    try {
      const { action, owner_id } = await req.json();
 
      if (action === "get_url") {
        const scopes = "https://www.googleapis.com/auth/calendar.events";
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${GOOGLE_CLIENT_ID}` +
          `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
          `&response_type=code` +
          `&scope=${encodeURIComponent(scopes)}` +
          `&access_type=offline` +
          `&prompt=consent` +
          `&state=${owner_id}`;
 
        return new Response(JSON.stringify({ url: authUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
 
      if (action === "disconnect") {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase.from("profiles").update({
          google_refresh_token: null,
          google_calendar_connected: false,
        }).eq("id", owner_id);
 
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
 
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("POST error:", e);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
 
  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});