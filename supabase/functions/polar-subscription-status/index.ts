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
      .select("polar_customer_id, trial_ends_at")
      .eq("id", company_id)
      .single();

    if (!company?.polar_customer_id) {
      return new Response(
        JSON.stringify({
          status: "not_linked",
          subscription: null,
          product: null,
          location_count: 0,
          trial_ends_at: company?.trial_ends_at || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get location count
    const { count: locationCount } = await adminClient
      .from("locations")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company_id);

    // Get subscriptions — try by customer_id first, fallback to external_customer_id
    let subsRes = await fetch(
      `${POLAR_API}/subscriptions/?customer_id=${company.polar_customer_id}&limit=5`,
      { headers: { Authorization: `Bearer ${POLAR_ACCESS_TOKEN}` } }
    );
    let subsData = await subsRes.json();
    if (!subsRes.ok) {
      throw new Error(`Polar API error [${subsRes.status}]: ${JSON.stringify(subsData)}`);
    }

    let activeSub = subsData.items?.find(
      (s: any) => s.status === "active" || s.status === "trialing"
    );

    // If no active sub found, try by external_customer_id (handles stale polar_customer_id)
    if (!activeSub) {
      const extRes = await fetch(
        `${POLAR_API}/subscriptions/?external_customer_id=${company_id}&limit=5`,
        { headers: { Authorization: `Bearer ${POLAR_ACCESS_TOKEN}` } }
      );
      if (extRes.ok) {
        const extData = await extRes.json();
        activeSub = extData.items?.find(
          (s: any) => s.status === "active" || s.status === "trialing"
        );
        // Fix the stale polar_customer_id
        if (activeSub?.customer_id && activeSub.customer_id !== company.polar_customer_id) {
          await adminClient
            .from("companies")
            .update({ polar_customer_id: activeSub.customer_id })
            .eq("id", company_id);
        }
      }
    }

    if (!activeSub) {
      return new Response(
        JSON.stringify({
          status: "inactive",
          subscription: null,
          product: null,
          location_count: locationCount || 0,
          trial_ends_at: company?.trial_ends_at || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        status: activeSub.status, // "active" or "trialing"
        subscription: {
          id: activeSub.id,
          status: activeSub.status,
          current_period_start: activeSub.current_period_start,
          current_period_end: activeSub.current_period_end,
          cancel_at_period_end: activeSub.cancel_at_period_end,
          seats: activeSub.seats,
          amount: activeSub.amount,
          currency: activeSub.currency,
        },
        product: activeSub.product
          ? { id: activeSub.product.id, name: activeSub.product.name }
          : null,
        location_count: locationCount || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
