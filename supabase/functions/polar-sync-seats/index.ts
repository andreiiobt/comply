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

    // Get company's Polar customer ID
    const { data: company } = await adminClient
      .from("companies")
      .select("polar_customer_id")
      .eq("id", company_id)
      .single();

    if (!company?.polar_customer_id) {
      return new Response(JSON.stringify({ error: "Company not linked to Polar" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Count locations in this company
    const { count: locationCount } = await adminClient
      .from("locations")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company_id);

    // Get active subscription for this customer
    const subsRes = await fetch(
      `${POLAR_API}/subscriptions/?customer_id=${company.polar_customer_id}&active=true`,
      {
        headers: { Authorization: `Bearer ${POLAR_ACCESS_TOKEN}` },
      }
    );
    const subsData = await subsRes.json();
    if (!subsRes.ok) {
      throw new Error(`Polar subscriptions error [${subsRes.status}]: ${JSON.stringify(subsData)}`);
    }

    if (!subsData.items || subsData.items.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active subscription found", location_count: locationCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update seat count on the subscription
    const subscription = subsData.items[0];
    const updateRes = await fetch(`${POLAR_API}/subscriptions/${subscription.id}/`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ seats: locationCount || 1 }),
    });

    const updateData = await updateRes.json();
    if (!updateRes.ok) {
      throw new Error(`Polar seat update error [${updateRes.status}]: ${JSON.stringify(updateData)}`);
    }

    return new Response(
      JSON.stringify({ success: true, locations: locationCount, subscription_id: subscription.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error syncing seats:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
