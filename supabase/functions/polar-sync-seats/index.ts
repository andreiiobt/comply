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
    let { data: company } = await adminClient
      .from("companies")
      .select("polar_customer_id")
      .eq("id", company_id)
      .single();

    // Count locations in this company
    const { count: locationCount } = await adminClient
      .from("locations")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company_id);

    const seatsToSet = locationCount || 1;

    // Robust lookup: Try by existing polar_customer_id first, then fallback to external_customer_id
    let activeSubscriptions: any[] = [];
    
    if (company?.polar_customer_id) {
      const subsRes = await fetch(
        `${POLAR_API}/subscriptions/?customer_id=${company.polar_customer_id}&active=true`,
        { headers: { Authorization: `Bearer ${POLAR_ACCESS_TOKEN}` } }
      );
      if (subsRes.ok) {
        const data = await subsRes.json();
        activeSubscriptions = data.items || [];
      }
    }

    // If no active subs found, try by external_customer_id (handles stale or missing polar_customer_id)
    if (activeSubscriptions.length === 0) {
      const extRes = await fetch(
        `${POLAR_API}/subscriptions/?external_customer_id=${company_id}&active=true`,
        { headers: { Authorization: `Bearer ${POLAR_ACCESS_TOKEN}` } }
      );
      if (extRes.ok) {
        const data = await extRes.json();
        activeSubscriptions = data.items || [];
        
        // If we found them via external_id, update our local polar_customer_id for consistency
        if (activeSubscriptions.length > 0 && activeSubscriptions[0].customer_id) {
          await adminClient
            .from("companies")
            .update({ polar_customer_id: activeSubscriptions[0].customer_id })
            .eq("id", company_id);
        }
      }
    }

    if (activeSubscriptions.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: "No active or trialing subscriptions found to sync.", 
          location_count: locationCount 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update seat count on ALL active/trialing subscriptions
    const results = [];
    for (const sub of activeSubscriptions) {
      // Doubly verify status is active or trialing
      if (sub.status !== "active" && sub.status !== "trialing") continue;

      console.log(`Updating sub ${sub.id} to ${seatsToSet} seats`);
      const updateRes = await fetch(`${POLAR_API}/subscriptions/${sub.id}/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ seats: seatsToSet }),
      });

      const updateData = await updateRes.json();
      results.push({
        id: sub.id,
        product: sub.product?.name,
        success: updateRes.ok,
        error: updateRes.ok ? null : updateData
      });
    }

    const failed = results.filter(r => !r.success);

    return new Response(
      JSON.stringify({ 
        success: failed.length === 0, 
        locations: locationCount, 
        results,
        summary: `Updated ${results.length - failed.length}/${results.length} subscriptions.`
      }),
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
