import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://vellu.cc","https://www.vellu.cc","https://vellu.io","https://www.vellu.io","http://localhost:5173","http://localhost:5174","http://localhost:5175","http://localhost:5176"];
function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "https://vellu.cc";
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Vary": "Origin" };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  try {
    const { staff_id, email, password, owner_id } = await req.json();

    if (!staff_id || !email || !password || !owner_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the owner exists and has a team account
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("account_type")
      .eq("id", owner_id)
      .single();

    if (!profile || profile.account_type !== "team") {
      return new Response(JSON.stringify({ error: "Not a team account" }), {
        status: 403,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Create auth user for staff member (createUser will fail if email already exists)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password: password,
      email_confirm: true, // Auto-confirm so they can login immediately
    });

    if (createError) {
      // Supabase returns "A user with this email address has already been registered" for duplicates
      const isDuplicate = createError.message?.toLowerCase().includes("already") || createError.message?.toLowerCase().includes("exists");
      return new Response(JSON.stringify({ error: isDuplicate ? "email_taken" : createError.message }), {
        status: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Link the auth user to the staff member
    const { error: updateError } = await supabaseAdmin
      .from("staff_members")
      .update({ user_id: newUser.user.id, email: email.toLowerCase() })
      .eq("id", staff_id)
      .eq("owner_id", owner_id);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});
