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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { company_id } = await req.json();

    // Validate caller is admin
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin role required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all HRIS-synced profiles for this company
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, merge_employee_id")
      .eq("company_id", company_id)
      .not("merge_employee_id", "is", null);

    if (profErr) throw profErr;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No HRIS-synced users found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all auth users to check last_sign_in_at
    const { data: userList, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw listErr;

    const authUsersMap = new Map<string, any>();
    for (const u of userList.users) {
      authUsersMap.set(u.id, u);
    }

    const origin = req.headers.get("origin") || "https://comply.iobt.com.au";
    let sent = 0;
    let skipped = 0;

    for (const profile of profiles) {
      const authUser = authUsersMap.get(profile.user_id);
      if (!authUser) continue;

      // Skip users who have already signed in
      if (authUser.last_sign_in_at) {
        skipped++;
        continue;
      }

      // Re-invite the user
      const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        authUser.email!,
        {
          redirectTo: `${origin}/claim`,
          data: { full_name: profile.full_name },
        }
      );

      if (inviteErr) {
        console.error(`Failed to invite ${authUser.email}:`, inviteErr);
        continue;
      }

      sent++;
    }

    return new Response(
      JSON.stringify({ sent, skipped, total: profiles.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("send-claim-emails error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
