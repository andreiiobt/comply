import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const POLAR_API = "https://api.polar.sh/v1";
const DEFAULT_PRODUCT_ID = "535ad322-9d4a-421c-89cf-e6b9edb8989a";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyName, slug, fullName, email, password } = await req.json();

    if (!companyName || !slug || !fullName || !email || !password) {
      return new Response(
        JSON.stringify({ error: "All fields are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate slug format
    const slugRegex = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;
    if (slug.length < 2 || !slugRegex.test(slug)) {
      return new Response(
        JSON.stringify({ error: "Subdomain must be 2-50 characters, lowercase alphanumeric and hyphens only" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reserved = ["www", "api", "app", "admin", "login", "register", "comply", "iobt", "mail", "smtp", "ftp"];
    if (reserved.includes(slug)) {
      return new Response(
        JSON.stringify({ error: "This subdomain is reserved" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check slug uniqueness
    const { data: existing } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "This subdomain is already taken" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create company with slug and trial dates
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({ name: companyName.trim(), slug: slug.trim() })
      .select()
      .single();

    if (companyError) throw companyError;

    // 2. Create auth user (auto-confirm for company admin)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName.trim() },
    });

    if (authError) {
      await supabaseAdmin.from("companies").delete().eq("id", company.id);
      const msg = authError.message?.toLowerCase() || "";
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return new Response(
          JSON.stringify({ error: "An account with this email already exists" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw authError;
    }

    const userId = authData.user.id;

    // 3. Update profile with company_id
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ company_id: company.id, full_name: fullName.trim() })
      .eq("user_id", userId);

    if (profileError) {
      await supabaseAdmin.from("profiles").upsert({
        user_id: userId,
        company_id: company.id,
        full_name: fullName.trim(),
      });
    }

    // 4. Insert admin role
    await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "admin",
      company_id: company.id,
    });

    // 5. Mark setup as completed
    await supabaseAdmin
      .from("setup_completed")
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq("id", 1);

    // 5. Create Polar customer and checkout session for trial
    let checkoutUrl: string | null = null;
    const POLAR_ACCESS_TOKEN = Deno.env.get("POLAR_ACCESS_TOKEN");

    if (POLAR_ACCESS_TOKEN) {
      try {
        // Create Polar customer
        const customerRes = await fetch(`${POLAR_API}/customers/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim(),
            name: companyName.trim(),
            external_id: company.id,
          }),
        });

        let polarCustomerId: string | null = null;

        if (customerRes.ok) {
          const customerData = await customerRes.json();
          polarCustomerId = customerData.id;
        } else if (customerRes.status === 422) {
          const lookupRes = await fetch(
            `${POLAR_API}/customers/?external_id=${encodeURIComponent(company.id)}`,
            { headers: { Authorization: `Bearer ${POLAR_ACCESS_TOKEN}` } }
          );
          const lookupData = await lookupRes.json();
          if (lookupData.items?.length > 0) {
            polarCustomerId = lookupData.items[0].id;
          }
        }

        if (polarCustomerId) {
          await supabaseAdmin
            .from("companies")
            .update({ polar_customer_id: polarCustomerId })
            .eq("id", company.id);

          // Build the success URL for the tenant's subdomain
          const origin = req.headers.get("origin") || "https://comply.iobt.com.au";
          const checkoutRes = await fetch(`${POLAR_API}/checkouts/`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              products: [DEFAULT_PRODUCT_ID],
              customer_id: polarCustomerId,
              success_url: `${origin}/login?setup=complete`,
            }),
          });

          if (checkoutRes.ok) {
            const checkoutData = await checkoutRes.json();
            checkoutUrl = checkoutData.url;
          }
        }
      } catch (polarError) {
        console.error("Polar integration error:", polarError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, companyId: company.id, slug: company.slug, checkoutUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
