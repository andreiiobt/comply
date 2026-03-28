import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const KOTORA_SYNC_URL = Deno.env.get("KOTORA_SYNC_URL");
  const USER_SYNC_SECRET = Deno.env.get("USER_SYNC_SECRET");

  if (!KOTORA_SYNC_URL || !USER_SYNC_SECRET) {
    return new Response(JSON.stringify({ error: "KOTORA_SYNC_URL or USER_SYNC_SECRET not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const payload = await req.json();
    const { type, record, old_record } = payload;

    // Determine action
    let action: string;
    if (type === "INSERT") action = "create";
    else if (type === "UPDATE") action = "update";
    else if (type === "DELETE") action = "delete";
    else {
      return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profileData = record || old_record;
    if (!profileData?.user_id) {
      return new Response(JSON.stringify({ error: "No user_id in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up email from auth
    let email: string | null = null;
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(profileData.user_id);
      email = authUser?.user?.email || null;
    } catch (e) {
      console.error("Failed to look up auth user email:", e);
    }

    // POST to Kotora
    const syncPayload = {
      user_id: profileData.user_id,
      full_name: profileData.full_name || null,
      avatar_url: profileData.avatar_url || null,
      company_id: profileData.company_id || null,
      email,
      action,
    };

    const resp = await fetch(KOTORA_SYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-secret": USER_SYNC_SECRET,
      },
      body: JSON.stringify(syncPayload),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`Kotora sync failed [${resp.status}]: ${errText}`);
      return new Response(JSON.stringify({ error: `Kotora returned ${resp.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await resp.json();
    return new Response(JSON.stringify({ success: true, kotora_response: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("sync-user-to-kotora error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
