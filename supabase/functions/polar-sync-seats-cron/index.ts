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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all companies with Polar customer IDs
    const { data: companies, error } = await adminClient
      .from("companies")
      .select("id, polar_customer_id")
      .not("polar_customer_id", "is", null);

    if (error) throw error;
    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ message: "No linked companies", synced: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let synced = 0;
    const errors: string[] = [];

    for (const company of companies) {
      try {
        // Count locations
        const { count: locationCount } = await adminClient
          .from("locations")
          .select("*", { count: "exact", head: true })
          .eq("company_id", company.id);

        // Get active subscription
        const subsRes = await fetch(
          `${POLAR_API}/subscriptions/?customer_id=${company.polar_customer_id}&active=true`,
          { headers: { Authorization: `Bearer ${POLAR_ACCESS_TOKEN}` } }
        );
        const subsData = await subsRes.json();

        if (!subsRes.ok || !subsData.items?.length) continue;

        const subscription = subsData.items[0];

        // Update seats
        const updateRes = await fetch(`${POLAR_API}/subscriptions/${subscription.id}/`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ seats: locationCount || 1 }),
        });

        if (updateRes.ok) {
          synced++;
        } else {
          const errData = await updateRes.json();
          errors.push(`Company ${company.id}: ${JSON.stringify(errData)}`);
        }
      } catch (e) {
        errors.push(`Company ${company.id}: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    }

    return new Response(
      JSON.stringify({ synced, total: companies.length, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in seat sync cron:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
