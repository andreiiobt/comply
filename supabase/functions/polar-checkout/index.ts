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

    const { company_id, product_id, success_url } = await req.json();
    if (!company_id || !product_id) {
      return new Response(JSON.stringify({ error: "company_id and product_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get company
    const { data: company } = await adminClient
      .from("companies")
      .select("id, name, polar_customer_id")
      .eq("id", company_id)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user count for initial seats
    const { count: userCount } = await adminClient
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company_id);

    // Build checkout body
    const checkoutBody: Record<string, unknown> = {
      products: [product_id],
      success_url: success_url || `${req.headers.get("origin") || "https://comply.iobt.com.au"}/admin/billing?checkout_id={CHECKOUT_ID}`,
      metadata: { company_id, company_name: company.name },
    };

    // Always use external_customer_id (Polar will auto-create/link the customer)
    checkoutBody.external_customer_id = company_id;

    let checkoutRes = await fetch(`${POLAR_API}/checkouts/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(checkoutBody),
    });

    // If external_customer_id fails, try creating the customer first
    if (!checkoutRes.ok) {
      const errData = await checkoutRes.json();
      console.log("First checkout attempt failed, trying to create customer:", JSON.stringify(errData));

      // Create Polar customer
      const customerRes = await fetch(`${POLAR_API}/customers/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: `${company_id}@company.comply.app`,
          name: company.name,
          external_id: company_id,
        }),
      });

      let polarCustomerId: string | null = null;
      if (customerRes.ok) {
        const custData = await customerRes.json();
        polarCustomerId = custData.id;
      } else if (customerRes.status === 422) {
        // Already exists — look up
        const lookupRes = await fetch(
          `${POLAR_API}/customers/?external_id=${encodeURIComponent(company_id)}`,
          { headers: { Authorization: `Bearer ${POLAR_ACCESS_TOKEN}` } }
        );
        const lookupData = await lookupRes.json();
        if (lookupData.items?.length > 0) {
          polarCustomerId = lookupData.items[0].id;
        }
      }

      if (polarCustomerId) {
        // Update company record
        await adminClient
          .from("companies")
          .update({ polar_customer_id: polarCustomerId })
          .eq("id", company_id);

        // Retry checkout with customer_id
        delete checkoutBody.external_customer_id;
        checkoutBody.customer_id = polarCustomerId;
        checkoutRes = await fetch(`${POLAR_API}/checkouts/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(checkoutBody),
        });
      }
    }

    const checkoutData = await checkoutRes.json();
    if (!checkoutRes.ok) {
      throw new Error(`Polar checkout error [${checkoutRes.status}]: ${JSON.stringify(checkoutData)}`);
    }

    return new Response(
      JSON.stringify({ checkout_url: checkoutData.url, checkout_id: checkoutData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating checkout:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
