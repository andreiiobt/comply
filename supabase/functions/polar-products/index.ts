import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const POLAR_API = "https://api.polar.sh/v1";

// Returns available products from Polar so the billing page can display
// plan names, pricing and a subscribe button for new/lapsed customers.

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

    // Verify caller is authenticated
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

    // Resolve organization ID — prefer env var, fall back to API lookup
    let organizationId: string | null = Deno.env.get("POLAR_ORGANIZATION_ID") ?? null;

    if (!organizationId) {
      const orgRes = await fetch(`${POLAR_API}/organizations/?limit=1`, {
        headers: { Authorization: `Bearer ${POLAR_ACCESS_TOKEN}` },
      });
      if (orgRes.ok) {
        const orgData = await orgRes.json();
        organizationId = orgData.items?.[0]?.id ?? null;
      }
    }

    // Build products URL — include organization_id if we have it
    const productsUrl = organizationId
      ? `${POLAR_API}/products/?organization_id=${organizationId}&is_archived=false&limit=10`
      : `${POLAR_API}/products/?is_archived=false&limit=10`;

    const res = await fetch(productsUrl, {
      headers: { Authorization: `Bearer ${POLAR_ACCESS_TOKEN}` },
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Polar API error [${res.status}]: ${JSON.stringify(err)}`);
    }

    const data = await res.json();
    const products = (data.items || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      prices: (p.prices || []).map((pr: any) => ({
        id: pr.id,
        amount: pr.price_amount,
        currency: pr.price_currency,
        interval: pr.recurring_interval ?? null,
      })),
    }));

    return new Response(JSON.stringify({ products }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
