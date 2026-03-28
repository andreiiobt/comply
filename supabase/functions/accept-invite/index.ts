import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { inviteCode } = await req.json();

    if (!inviteCode) {
      return new Response(
        JSON.stringify({ error: "Invite code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch invitation
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("invitations")
      .select("*")
      .eq("invite_code", inviteCode)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .single();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired invitation" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already has a company
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("user_id", userId)
      .single();

    if (profile?.company_id) {
      return new Response(
        JSON.stringify({ error: "You are already part of a company" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update profile with company_id
    await supabaseAdmin
      .from("profiles")
      .update({ company_id: invite.company_id })
      .eq("user_id", userId);

    // Insert user role
    const roleData: any = {
      user_id: userId,
      role: invite.role,
      company_id: invite.company_id,
    };
    if (invite.location_id) {
      roleData.location_id = invite.location_id;
    }
    await supabaseAdmin.from("user_roles").insert(roleData);

    // Insert custom roles from comma-separated sub_role field
    if (invite.sub_role) {
      const roleNames = invite.sub_role.split(",").map((n: string) => n.trim()).filter(Boolean);
      if (roleNames.length > 0) {
        // Look up custom_role ids by name
        const { data: matchedRoles } = await supabaseAdmin
          .from("custom_roles")
          .select("id")
          .eq("company_id", invite.company_id)
          .in("name", roleNames);

        if (matchedRoles && matchedRoles.length > 0) {
          const rows = matchedRoles.map((cr: any) => ({
            user_id: userId,
            custom_role_id: cr.id,
            company_id: invite.company_id,
          }));
          await supabaseAdmin.from("user_custom_roles").insert(rows);
        }
      }
    }

    // Mark invitation as accepted
    await supabaseAdmin
      .from("invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: userId,
      })
      .eq("id", invite.id);

    return new Response(
      JSON.stringify({ success: true, role: invite.role }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
