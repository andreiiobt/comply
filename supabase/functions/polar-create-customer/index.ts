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

    // Get company details
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .select("id, name, polar_customer_id")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If already has a Polar customer, return it
    if (company.polar_customer_id) {
      return new Response(
        JSON.stringify({ polar_customer_id: company.polar_customer_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get admin user email for the customer
    const userId = claimsData.claims.sub as string;
    const { data: { user } } = await adminClient.auth.admin.getUserById(userId);

    // Try to create Polar customer
    const polarRes = await fetch(`${POLAR_API}/customers/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user?.email || `${company_id}@company.comply.app`,
        name: company.name,
        external_id: company_id,
        metadata: { company_id, company_name: company.name },
      }),
    });

    let polarCustomerId: string;

    if (polarRes.ok) {
      const polarData = await polarRes.json();
      polarCustomerId = polarData.id;
    } else if (polarRes.status === 422) {
      // Customer already exists — look them up by external_id
      const lookupRes = await fetch(
        `${POLAR_API}/customers/?external_id=${encodeURIComponent(company_id)}`,
        { headers: { Authorization: `Bearer ${POLAR_ACCESS_TOKEN}` } }
      );
      const lookupData = await lookupRes.json();
      if (!lookupRes.ok || !lookupData.items?.length) {
        throw new Error(`Could not find existing Polar customer for company ${company_id}`);
      }
      polarCustomerId = lookupData.items[0].id;
    } else {
      const errorData = await polarRes.json();
      throw new Error(`Polar API error [${polarRes.status}]: ${JSON.stringify(errorData)}`);
    }

    // Store the Polar customer ID
    const { error: updateError } = await adminClient
      .from("companies")
      .update({ polar_customer_id: polarCustomerId })
      .eq("id", company_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ polar_customer_id: polarCustomerId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating Polar customer:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
