import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MERGE_API_BASE = "https://api.merge.dev/api";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const MERGE_API_KEY = Deno.env.get("MERGE_API_KEY");
  if (!MERGE_API_KEY) {
    return new Response(JSON.stringify({ error: "MERGE_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authenticate caller
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: authUser }, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !authUser) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = authUser.id;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Check admin role
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Admin role required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create-link-token") {
      // Create a Merge Link token for the embedded component
      const { end_user_email, end_user_org_name, end_user_origin_id } = body;

      const resp = await fetch(`${MERGE_API_BASE}/integrations/create-link-token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MERGE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          end_user_origin_id: end_user_origin_id,
          end_user_organization_name: end_user_org_name,
          end_user_email_address: end_user_email,
          categories: ["hris"],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Merge create-link-token failed [${resp.status}]: ${errText}`);
      }

      const data = await resp.json();
      return new Response(JSON.stringify({ link_token: data.link_token }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "exchange-token") {
      // Exchange public_token for account_token after user completes Merge Link
      const { public_token, company_id } = body;

      const resp = await fetch(`${MERGE_API_BASE}/integrations/account-token/${public_token}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MERGE_API_KEY}`,
          "Content-Type": "application/json",
        },
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Merge exchange-token failed [${resp.status}]: ${errText}`);
      }

      const data = await resp.json();
      const accountToken = data.account_token;
      const integrationName = data.integration?.name || "HRIS";

      // Upsert the integration record
      const { data: existing } = await supabaseAdmin
        .from("hris_integrations")
        .select("id")
        .eq("company_id", company_id)
        .maybeSingle();

      if (existing) {
        await supabaseAdmin
          .from("hris_integrations")
          .update({
            merge_account_token: accountToken,
            is_active: true,
          })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("hris_integrations").insert({
          company_id,
          merge_account_token: accountToken,
          is_active: true,
        });
      }

      return new Response(
        JSON.stringify({ success: true, integration_name: integrationName }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("merge-link error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
