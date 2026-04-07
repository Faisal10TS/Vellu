// supabase/functions/send-client-login/index.ts
// Sends a 6-digit login code to a client's email for the client dashboard

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = email.toLowerCase().trim();

    // Find client
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, first_name")
      .eq("email", cleanEmail)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate 6-digit code (cryptographically secure)
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const code = String(100000 + (randomBytes[0] % 900000));
    
    // Set expiry to 5 minutes from now
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Save token
    const { error: tokenError } = await supabase
      .from("client_tokens")
      .insert({
        client_id: client.id,
        email: cleanEmail,
        token: code,
        expires_at: expiresAt,
        used: false,
      });

    if (tokenError) {
      console.error("Token insert error:", tokenError);
      return new Response(
        JSON.stringify({ error: "Failed to create login token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Vellu <noreply@vellu.cc>",
        to: [cleanEmail],
        subject: `Je inlogcode: ${code}`,
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 32px 24px; color: #1a1714;">
            <div style="text-align: center; margin-bottom: 28px;">
              <div style="font-size: 24px; font-weight: 300; letter-spacing: 0.18em; color: #c9a96e;">vellu</div>
            </div>
            
            <p style="font-size: 15px; margin-bottom: 8px;">
              Hoi${client.first_name ? ` ${client.first_name}` : ""},
            </p>
            
            <p style="font-size: 14px; color: #555; line-height: 1.5; margin-bottom: 24px;">
              Gebruik onderstaande code om je afspraken te bekijken:
            </p>
            
            <div style="text-align: center; margin: 24px 0;">
              <div style="display: inline-block; background: #f8f7f5; border: 2px solid #c9a96e; border-radius: 16px; padding: 20px 40px;">
                <div style="font-size: 36px; font-weight: 600; letter-spacing: 0.4em; color: #1a1714; font-family: monospace;">
                  ${code}
                </div>
              </div>
            </div>
            
            <p style="font-size: 12px; color: #999; text-align: center; margin-top: 20px;">
              Deze code is 5 minuten geldig.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0;" />
            
            <p style="font-size: 11px; color: #bbb; text-align: center;">
              Heb je dit niet aangevraagd? Je kunt deze email veilig negeren.
            </p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("Resend error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
