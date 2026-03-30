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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
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

    // Try to create a customer session via external_customer_id.
    // Polar returns 422 (not 404) when the customer doesn't exist yet,
    // so we handle both and create the customer on first use.

    const createSessionByExternalId = async (extId: string) => {
      return await fetch(`${POLAR_API}/customer-sessions/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ external_customer_id: extId }),
      });
    };

    const createSessionByCustomerId = async (customerId: string) => {
      return await fetch(`${POLAR_API}/customer-sessions/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ customer_id: customerId }),
      });
    };

    let portalRes = await createSessionByExternalId(company_id);

    // 404 or 422 both mean "customer not found" depending on Polar API version
    if (portalRes.status === 404 || portalRes.status === 422) {
      console.log("Customer not found in Polar, creating one now...");

      // Look up the user's email to use as the customer email
      const { data: { user: adminUser } } = await adminClient.auth.admin.getUserById(user.id);

      const createRes = await fetch(`${POLAR_API}/customers/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: adminUser?.email || `${company_id}@company.comply.app`,
          name: company.name,
          external_id: company_id,
        }),
      });

      let polarCustomerId: string;

      if (createRes.ok) {
        const newCustomer = await createRes.json();
        polarCustomerId = newCustomer.id;
      } else if (createRes.status === 422) {
        // Customer already exists with this external_id — look them up
        const lookupRes = await fetch(
          `${POLAR_API}/customers/?external_id=${encodeURIComponent(company_id)}`,
          { headers: { Authorization: `Bearer ${POLAR_ACCESS_TOKEN}` } }
        );
        const lookupData = await lookupRes.json();
        if (!lookupRes.ok || !lookupData.items?.length) {
          const err = await createRes.json().catch(() => ({}));
          throw new Error(`Failed to create Polar customer: ${JSON.stringify(err)}`);
        }
        polarCustomerId = lookupData.items[0].id;
      } else {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(`Failed to create Polar customer: ${JSON.stringify(err)}`);
      }

      // Store the customer ID and create session using it directly
      await adminClient
        .from("companies")
        .update({ polar_customer_id: polarCustomerId })
        .eq("id", company_id);

      portalRes = await createSessionByCustomerId(polarCustomerId);
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
