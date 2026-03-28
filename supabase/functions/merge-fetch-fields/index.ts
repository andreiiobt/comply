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

    // Validate caller is admin
    const authHeader = req.headers.get("Authorization");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    if (authHeader?.startsWith("Bearer ")) {
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
      const { data: roleCheck } = await supabaseAdmin.rpc("has_role", {
        _user_id: authUser.id,
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

    // Get integration config
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

    const mergeHeaders = {
      Authorization: `Bearer ${MERGE_API_KEY}`,
      "X-Account-Token": integration.merge_account_token,
      "Content-Type": "application/json",
    };

    // Fetch departments, locations, and employees in parallel
    // Some HRIS integrations don't support /departments or /locations, so handle 404 gracefully
    const [deptResult, locResult, empResult] = await Promise.all([
      fetchAllPages(`${MERGE_API_BASE}/departments`, mergeHeaders).catch(() => []),
      fetchAllPages(`${MERGE_API_BASE}/locations`, mergeHeaders).catch(() => []),
      fetchAllPages(`${MERGE_API_BASE}/employees`, mergeHeaders),
    ]);

    // Filter out UUID-like values that aren't human-readable names
    const isReadableName = (val: string) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    // Extract unique department names from /departments endpoint
    const departments = [
      ...new Set(deptResult.map((d: any) => d.name).filter(Boolean)),
    ].filter(isReadableName) as string[];

    // Extract unique work location names from /locations endpoint
    const work_locations = [
      ...new Set(locResult.map((l: any) => l.name).filter(Boolean)),
    ].filter(isReadableName) as string[];

    // Extract unique job titles from employees
    const job_titles = [
      ...new Set(empResult.map((e: any) => e.job_title).filter(Boolean)),
    ].filter(isReadableName).sort() as string[];

    // Also extract department names from employees
    const empDepartments = [
      ...new Set(
        empResult
          .map((e: any) => e.department?.name || (typeof e.department === "string" ? e.department : null))
          .filter(Boolean)
      ),
    ].filter(isReadableName) as string[];

    // Extract work locations from employees too
    const empLocations = [
      ...new Set(
        empResult
          .flatMap((e: any) => e.work_location?.name ? [e.work_location.name] : (typeof e.work_location === "string" ? [e.work_location] : []))
          .filter(Boolean)
      ),
    ].filter(isReadableName) as string[];

    // Merge lists
    const allDepartments = [...new Set([...departments, ...empDepartments])].sort();
    const allLocations = [...new Set([...work_locations, ...empLocations])].sort();

    return new Response(
      JSON.stringify({ departments: allDepartments, work_locations: allLocations, job_titles }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("merge-fetch-fields error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fetchAllPages(baseUrl: string, headers: Record<string, string>): Promise<any[]> {
  let all: any[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(baseUrl);
    url.searchParams.set("page_size", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    const resp = await fetch(url.toString(), { headers });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Merge API error [${resp.status}]: ${body}`);
    }

    const data = await resp.json();
    all = all.concat(data.results || []);
    cursor = data.next || null;
  } while (cursor);

  return all;
}
