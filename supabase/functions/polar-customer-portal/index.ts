import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const POLAR_API = "https://api.polar.sh/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const POLAR_ACCESS_TOKEN = Deno.env.get("POLAR_ACCESS_TOKEN");
    if (!POLAR_ACCESS_TOKEN) throw new Error("POLAR_ACCESS_TOKEN is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { company_id } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: company } = await adminClient
      .from("companies")
      .select("name, polar_customer_id")
      .eq("id", company_id)
      .single();

    if (!company) throw new Error("Company not found");

    // Unified Logic: Ensure customer exists in Polar and is linked to our external ID
    // We'll first try to create the session with external_customer_id.
    // If it fails with 404, we'll create the customer and then try again.
    
    const createSession = async (extId: string) => {
      return await fetch(`${POLAR_API}/customer-sessions/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ external_customer_id: extId }),
      });
    };

    let portalRes = await createSession(company_id);
    
    if (portalRes.status === 404) {
      console.log("Customer not found in Polar, creating one now...");
      const createRes = await fetch(`${POLAR_API}/customers/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: `${company_id}@company.comply.app`, // Fallback email
          name: company.name,
          external_id: company_id,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(`Failed to create Polar customer: ${JSON.stringify(err)}`);
      }

      const newCustomer = await createRes.json();
      await adminClient
        .from("companies")
        .update({ polar_customer_id: newCustomer.id })
        .eq("id", company_id);

      // Retry session creation
      portalRes = await createSession(company_id);
    }

    const portalData = await portalRes.json();
    if (!portalRes.ok) {
      throw new Error(`Polar Portal API error [${portalRes.status}]: ${JSON.stringify(portalData)}`);
    }

    return new Response(
      JSON.stringify({ url: portalData.customer_portal_url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating customer portal session:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
