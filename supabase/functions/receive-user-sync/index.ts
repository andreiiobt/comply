import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const syncSecret = Deno.env.get("USER_SYNC_SECRET");
  if (!syncSecret) {
    return new Response(JSON.stringify({ error: "USER_SYNC_SECRET not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const headerSecret = req.headers.get("x-sync-secret");
  if (headerSecret !== syncSecret) {
    return new Response(JSON.stringify({ error: "Invalid sync secret" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { user_id, full_name, avatar_url, company_id, email, action } = await req.json();

    if (!user_id || !action) {
      return new Response(JSON.stringify({ error: "user_id and action required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      await supabase.from("profiles").delete().eq("user_id", user_id);
      return new Response(JSON.stringify({ success: true, action: "deleted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // create or update
    if (email) {
      // Check if auth user exists
      const { data: existingUser } = await supabase.auth.admin.getUserById(user_id);
      if (!existingUser?.user) {
        // Create auth user with the same UUID
        const { error: createErr } = await supabase.auth.admin.createUser({
          id: user_id,
          email,
          email_confirm: true,
          user_metadata: { full_name: full_name || email },
        });
        if (createErr) {
          console.error("Failed to create auth user:", createErr);
        }
      }
    }

    // Upsert profile
    const { error: upsertErr } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id,
          full_name: full_name || null,
          avatar_url: avatar_url || null,
          company_id: company_id || null,
        },
        { onConflict: "user_id" }
      );

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, action }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("receive-user-sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
