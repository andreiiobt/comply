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
    const { company_id, apply, overrides } = await req.json();

    // Validate caller is admin
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: authUser }, error: userErr } = await supabaseUser.auth.getUser();
      if (userErr || !authUser) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleCheck } = await supabaseAdmin.rpc("has_role", {
        _user_id: authUser.id, _role: "admin",
      });
      if (!roleCheck) {
        return new Response(JSON.stringify({ error: "Admin role required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get integration + mappings
    const { data: integration, error: intErr } = await supabaseAdmin
      .from("hris_integrations")
      .select("*")
      .eq("company_id", company_id)
      .eq("is_active", true)
      .single();

    if (intErr || !integration) {
      return new Response(JSON.stringify({ error: "No active HRIS integration found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fm = (integration.field_mappings as any) || {};
    const roleMappings: Record<string, string> = fm.role_mapping || {};
    const locationMappings: Record<string, string> = fm.location_mapping || {};
    const customRoleMappings: Record<string, string> = fm.custom_role_mapping || {};
    const defaultRole = fm.default_role || "staff";

    // Get all HRIS-synced profiles (those with merge_employee_id)
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, merge_employee_id, company_id")
      .eq("company_id", company_id)
      .not("merge_employee_id", "is", null);

    if (profErr) throw profErr;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ changes: [], applied: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user roles for these users
    const userIds = profiles.map((p: any) => p.user_id);
    const { data: userRoles } = await supabaseAdmin
      .from("user_roles")
      .select("id, user_id, role, location_id")
      .eq("company_id", company_id)
      .in("user_id", userIds);

    // Get user custom roles
    const { data: userCustomRoles } = await supabaseAdmin
      .from("user_custom_roles")
      .select("id, user_id, custom_role_id")
      .eq("company_id", company_id)
      .in("user_id", userIds);

    // Get custom roles for name lookup
    const { data: customRolesData } = await supabaseAdmin
      .from("custom_roles")
      .select("id, name")
      .eq("company_id", company_id);

    // Get locations for name lookup
    const { data: locationsData } = await supabaseAdmin
      .from("locations")
      .select("id, name")
      .eq("company_id", company_id);

    const customRolesMap: Record<string, string> = {};
    (customRolesData || []).forEach((cr: any) => { customRolesMap[cr.id] = cr.name; });
    const locationsMap: Record<string, string> = {};
    (locationsData || []).forEach((l: any) => { locationsMap[l.id] = l.name; });

    // Fetch employee data from Merge to know their department/location
    const MERGE_API_KEY = Deno.env.get("MERGE_API_KEY");
    if (!MERGE_API_KEY) {
      return new Response(JSON.stringify({ error: "MERGE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mergeHeaders = {
      Authorization: `Bearer ${MERGE_API_KEY}`,
      "X-Account-Token": integration.merge_account_token,
      "Content-Type": "application/json",
    };

    // Fetch all employees and departments in parallel
    const fetchAllPages = async (baseUrl: string, extraParams?: Record<string, string>): Promise<any[]> => {
      let all: any[] = [];
      let pgCursor: string | null = null;
      do {
        const url = new URL(baseUrl);
        url.searchParams.set("page_size", "200");
        if (extraParams) {
          for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
        }
        if (pgCursor) url.searchParams.set("cursor", pgCursor);
        const resp = await fetch(url.toString(), { headers: mergeHeaders });
        if (!resp.ok) {
          const body = await resp.text();
          throw new Error(`Merge API error [${resp.status}]: ${body}`);
        }
        const data = await resp.json();
        all = all.concat(data.results || []);
        pgCursor = data.next || null;
      } while (pgCursor);
      return all;
    };

    const [allEmployees, allDepartments] = await Promise.all([
      fetchAllPages("https://api.merge.dev/api/hris/v1/employees", { expand: "work_location" }),
      fetchAllPages("https://api.merge.dev/api/hris/v1/departments").catch(() => []),
    ]);

    // Build department id → name map
    const deptMap: Record<string, string> = {};
    for (const dept of allDepartments) {
      if (dept.id && dept.name) deptMap[dept.id] = dept.name;
    }

    // Build merge_employee_id → employee map
    const empMap: Record<string, any> = {};
    for (const emp of allEmployees) {
      empMap[emp.id] = emp;
    }

    // Compute changes for each synced user
    const changes: any[] = [];

    for (const profile of profiles) {
      const emp = empMap[profile.merge_employee_id!];
      if (!emp) continue;

      // Resolve department: could be a UUID ref, an object with .name, or a plain string
      const rawDept = emp.department;
      const department = rawDept?.name || deptMap[rawDept] || (typeof rawDept === "string" && !rawDept.match(/^[0-9a-f-]{36}$/i) ? rawDept : "");
      const jobTitle = emp.job_title || "";
      const workLocation = emp.work_location?.name || (typeof emp.work_location === "string" ? emp.work_location : "");

      // Determine proposed role
      const proposedRole = roleMappings[department] || roleMappings[jobTitle] || defaultRole;
      // Determine proposed location
      const proposedLocationId = locationMappings[workLocation] || null;
      // Determine proposed custom role
      const proposedCustomRoleId = customRoleMappings[department] || customRoleMappings[jobTitle] || null;

      const currentRoleRow = (userRoles || []).find((r: any) => r.user_id === profile.user_id);
      const currentRole = currentRoleRow?.role || null;
      const currentLocationId = currentRoleRow?.location_id || null;
      const currentCustomRoleIds = (userCustomRoles || [])
        .filter((ucr: any) => ucr.user_id === profile.user_id)
        .map((ucr: any) => ucr.custom_role_id);

      const roleChanged = currentRole !== proposedRole;
      const locationChanged = currentLocationId !== proposedLocationId;
      const customRoleChanged = proposedCustomRoleId
        ? !currentCustomRoleIds.includes(proposedCustomRoleId)
        : false;

      if (roleChanged || locationChanged || customRoleChanged) {
        changes.push({
          user_id: profile.user_id,
          full_name: profile.full_name,
          hris_department: department,
          hris_job_title: jobTitle,
          hris_work_location: workLocation,
          current_role: currentRole,
          proposed_role: proposedRole,
          current_location: currentLocationId ? (locationsMap[currentLocationId] || currentLocationId) : null,
          proposed_location: proposedLocationId ? (locationsMap[proposedLocationId] || proposedLocationId) : null,
          proposed_location_id: proposedLocationId,
          current_custom_roles: currentCustomRoleIds.map((id: string) => customRolesMap[id] || id),
          proposed_custom_role: proposedCustomRoleId ? (customRolesMap[proposedCustomRoleId] || proposedCustomRoleId) : null,
          proposed_custom_role_id: proposedCustomRoleId,
          role_changed: roleChanged,
          location_changed: locationChanged,
          custom_role_changed: customRoleChanged,
          role_row_id: currentRoleRow?.id || null,
        });
      }
    }

    // If apply=true, actually make the changes
    let applied = false;
    let applied_count = 0;
    if (apply) {
      // Use overrides if provided (admin-edited values), otherwise use computed changes
      const toApply = overrides && Array.isArray(overrides) ? overrides : changes.map((c: any) => ({
        user_id: c.user_id,
        role: c.proposed_role,
        location_id: c.proposed_location_id,
        custom_role_id: c.proposed_custom_role_id,
        role_row_id: c.role_row_id,
      }));

      if (toApply.length > 0) {
        for (const update of toApply) {
          // Find existing role row for this user
          const roleRow = (userRoles || []).find((r: any) => r.user_id === update.user_id);
          
          if (roleRow) {
            await supabaseAdmin
              .from("user_roles")
              .update({
                role: update.role,
                location_id: update.location_id || null,
              })
              .eq("id", update.role_row_id || roleRow.id);
          }

          // Add custom role if specified
          if (update.custom_role_id) {
            const existing = (userCustomRoles || []).find(
              (ucr: any) => ucr.user_id === update.user_id && ucr.custom_role_id === update.custom_role_id
            );
            if (!existing) {
              await supabaseAdmin.from("user_custom_roles").insert({
                user_id: update.user_id,
                custom_role_id: update.custom_role_id,
                company_id: company_id,
              });
            }
          }
        }
        applied = true;
        applied_count = toApply.length;
      }
    }

    return new Response(
      JSON.stringify({ changes, applied, applied_count, total_synced: profiles.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("apply-hris-mappings error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
