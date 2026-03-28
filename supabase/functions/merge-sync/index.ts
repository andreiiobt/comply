import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MERGE_API_BASE = "https://api.merge.dev/api/hris/v1";

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const { company_id } = await req.json();

    // Validate caller is admin or service role
    const authHeader = req.headers.get("Authorization");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    if (authHeader?.startsWith("Bearer ") && !authHeader.includes(serviceRoleKey.substring(0, 20))) {
      const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
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
      const { data: roleCheck } = await supabaseAdmin.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (!roleCheck) {
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

    // Fetch integration config
    const { data: integration, error: intErr } = await supabaseAdmin
      .from("hris_integrations")
      .select("*")
      .eq("company_id", company_id)
      .eq("is_active", true)
      .single();

    if (intErr || !integration) {
      return new Response(JSON.stringify({ error: "No active HRIS integration found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create sync log entry
    const { data: syncLog } = await supabaseAdmin
      .from("hris_sync_log")
      .insert({ company_id, status: "running" })
      .select()
      .single();

    const logId = syncLog?.id;
    let usersCreated = 0;
    let usersUpdated = 0;
    let usersDeactivated = 0;

    try {
      // Fetch all employees from Merge, paginating
      let allEmployees: any[] = [];
      let nextCursor: string | null = null;

      do {
        const url = new URL(`${MERGE_API_BASE}/employees`);
        url.searchParams.set("page_size", "100");
        if (nextCursor) url.searchParams.set("cursor", nextCursor);

        const resp = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${MERGE_API_KEY}`,
            "X-Account-Token": integration.merge_account_token,
            "Content-Type": "application/json",
          },
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          throw new Error(`Merge API error [${resp.status}]: ${errBody}`);
        }

        const data = await resp.json();
        allEmployees = allEmployees.concat(data.results || []);
        nextCursor = data.next || null;
      } while (nextCursor);

      console.log(`Merge API returned ${allEmployees.length} employees for company ${company_id}`);

      // If Merge returned zero employees, mark as warning — the initial data pull
      // from the HRIS provider may still be in progress, or the sandbox is empty.
      if (allEmployees.length === 0) {
        if (logId) {
          await supabaseAdmin
            .from("hris_sync_log")
            .update({
              status: "warning",
              completed_at: new Date().toISOString(),
              error_message: "Merge returned 0 employees. The initial data pull from your HRIS provider may still be in progress — please try again in a few minutes.",
            })
            .eq("id", logId);
        }

        return new Response(
          JSON.stringify({
            success: false,
            warning: "no_employees",
            message: "Merge returned 0 employees. The initial data pull from your HRIS provider may still be in progress. Please try again in a few minutes.",
            users_created: 0,
            users_updated: 0,
            users_deactivated: 0,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fieldMappings = integration.field_mappings as any || {};
      const roleMappings = fieldMappings.role_mapping || {};
      const locationMappings = fieldMappings.location_mapping || {};
      const customRoleMappings = fieldMappings.custom_role_mapping || {};
      const defaultRole = fieldMappings.default_role || "staff";

      // Pre-fetch all auth users once for email lookups (scalability fix)
      const allAuthUsers: any[] = [];
      let authPage = 0;
      const AUTH_PAGE_SIZE = 1000;
      while (true) {
        const { data: { users: pageUsers } } = await supabaseAdmin.auth.admin.listUsers({
          page: authPage + 1,
          perPage: AUTH_PAGE_SIZE,
        });
        if (!pageUsers || pageUsers.length === 0) break;
        allAuthUsers.push(...pageUsers);
        if (pageUsers.length < AUTH_PAGE_SIZE) break;
        authPage++;
      }
      const authUsersByEmail = new Map(
        allAuthUsers.map((u: any) => [u.email?.toLowerCase(), u])
      );

      // Process each employee
      for (const emp of allEmployees) {
        const email = emp.work_email || emp.personal_email;
        if (!email) continue;

        const fullName = [emp.first_name, emp.last_name].filter(Boolean).join(" ") || email;
        const mergeId = emp.id;
        const isTerminated = emp.employment_status === "INACTIVE" || emp.termination_date;

        // Determine role from department
        const department = emp.department?.name || emp.department || "";
        const jobTitle = emp.job_title || "";
        const mappedRole = roleMappings[department] || roleMappings[jobTitle] || defaultRole;

        // Determine location
        const workLocation = emp.work_location?.name || emp.work_location || "";
        const mappedLocationId = locationMappings[workLocation] || null;

        // Determine custom role
        const mappedCustomRoleId = customRoleMappings[department] || customRoleMappings[jobTitle] || null;

        // Check if user exists by merge_employee_id or email
        let existingProfile = null;

        if (mergeId) {
          const { data: byMergeId } = await supabaseAdmin
            .from("profiles")
            .select("*, user_roles(id, role, location_id)")
            .eq("merge_employee_id", mergeId)
            .eq("company_id", company_id)
            .maybeSingle();
          existingProfile = byMergeId;
        }

        if (!existingProfile) {
          // Try by email via cached auth users map
          const matchedUser = authUsersByEmail.get(email.toLowerCase());
          if (matchedUser) {
            const { data: byUserId } = await supabaseAdmin
              .from("profiles")
              .select("*, user_roles(id, role, location_id)")
              .eq("user_id", matchedUser.id)
              .eq("company_id", company_id)
              .maybeSingle();
            existingProfile = byUserId;
          }
        }

        if (existingProfile) {
          if (isTerminated) {
            // Deactivate: remove roles for this company only
            await supabaseAdmin
              .from("user_roles")
              .delete()
              .eq("user_id", existingProfile.user_id)
              .eq("company_id", company_id);
            usersDeactivated++;
          } else {
            // Update profile
            await supabaseAdmin
              .from("profiles")
              .update({
                full_name: fullName,
                merge_employee_id: mergeId,
              })
              .eq("user_id", existingProfile.user_id);

            // Update role if changed
            const existingRoles = existingProfile.user_roles || [];
            const currentRole = existingRoles[0]?.role;
            if (currentRole !== mappedRole || existingRoles[0]?.location_id !== mappedLocationId) {
              if (existingRoles.length > 0) {
                await supabaseAdmin
                  .from("user_roles")
                  .update({
                    role: mappedRole,
                    location_id: mappedLocationId,
                  })
                  .eq("id", existingRoles[0].id);
              }
            }

            usersUpdated++;
          }
        } else if (!isTerminated) {
          // Invite new user via email (sends magic link)
          const origin = req.headers.get("origin") || "https://comply.iobt.com.au";
          const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            email,
            {
              redirectTo: `${origin}/claim`,
              data: { full_name: fullName },
            }
          );

          if (inviteErr || !inviteData?.user) {
            console.error(`Failed to invite user ${email}:`, inviteErr);
            continue;
          }

          const newUserId = inviteData.user.id;

          // Update profile with merge ID and company
          await supabaseAdmin
            .from("profiles")
            .update({
              merge_employee_id: mergeId,
              company_id,
              full_name: fullName,
            })
            .eq("user_id", newUserId);

          // Create role
          await supabaseAdmin.from("user_roles").insert({
            user_id: newUserId,
            role: mappedRole,
            company_id,
            location_id: mappedLocationId,
          });

          // Assign custom role if mapped
          if (mappedCustomRoleId) {
            await supabaseAdmin.from("user_custom_roles").insert({
              user_id: newUserId,
              custom_role_id: mappedCustomRoleId,
              company_id,
            });
          }

          usersCreated++;
        }
      }

      // Update sync log as success
      if (logId) {
        await supabaseAdmin
          .from("hris_sync_log")
          .update({
            status: "success",
            completed_at: new Date().toISOString(),
            users_created: usersCreated,
            users_updated: usersUpdated,
            users_deactivated: usersDeactivated,
          })
          .eq("id", logId);
      }

      // Update last_synced_at
      await supabaseAdmin
        .from("hris_integrations")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", integration.id);

      return new Response(
        JSON.stringify({
          success: true,
          users_created: usersCreated,
          users_updated: usersUpdated,
          users_deactivated: usersDeactivated,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (syncError: any) {
      // Update sync log as error
      if (logId) {
        await supabaseAdmin
          .from("hris_sync_log")
          .update({
            status: "error",
            completed_at: new Date().toISOString(),
            error_message: syncError.message,
          })
          .eq("id", logId);
      }
      throw syncError;
    }
  } catch (error: any) {
    console.error("merge-sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
