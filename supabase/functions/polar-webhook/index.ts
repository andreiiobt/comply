import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Polar uses the Standard Webhooks spec (https://www.standardwebhooks.com).
// Headers: webhook-id, webhook-timestamp, webhook-signature
// Signed payload: "{webhook-id}.{webhook-timestamp}.{raw-body}"
// Secret format: "whsec_<base64>" — base64-decode before using as HMAC key.

async function verifyPolarSignature(
  rawBody: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const msgId = headers.get("webhook-id");
  const msgTimestamp = headers.get("webhook-timestamp");
  const msgSignature = headers.get("webhook-signature");

  if (!msgId || !msgTimestamp || !msgSignature) {
    console.error("Missing required webhook headers");
    return false;
  }

  // Reject requests older than 5 minutes
  const ts = parseInt(msgTimestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    console.error("Webhook timestamp out of acceptable range");
    return false;
  }

  // Decode the whsec_ secret
  const base64Secret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const secretBytes = Uint8Array.from(atob(base64Secret), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signedContent = `${msgId}.${msgTimestamp}.${rawBody}`;
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent)
  );
  const computedSig = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

  // webhook-signature can be space-separated list of "v1,<base64>" entries
  const providedSigs = msgSignature
    .split(" ")
    .map((s) => (s.startsWith("v1,") ? s.slice(3) : s));

  return providedSigs.some((sig) => sig === computedSig);
}

// Resolve which company (by our internal ID) a Polar subscription belongs to.
// Tries customer.external_id first (set at checkout), then looks up by polar_customer_id.
async function resolveCompanyId(
  adminClient: ReturnType<typeof createClient>,
  sub: any
): Promise<string | null> {
  const externalId: string | undefined = sub?.customer?.external_id;
  if (externalId) return externalId;

  const customerId: string | undefined = sub?.customer_id;
  if (!customerId) return null;

  const { data } = await adminClient
    .from("companies")
    .select("id")
    .eq("polar_customer_id", customerId)
    .maybeSingle();

  return data?.id ?? null;
}

// Write the subscription state cache fields to the companies table.
async function cacheSubscriptionState(
  adminClient: ReturnType<typeof createClient>,
  companyId: string,
  sub: any
) {
  const update: Record<string, unknown> = {
    subscription_status: sub.status ?? null,
    subscription_seats: sub.seats ?? null,
    subscription_period_end: sub.current_period_end ?? null,
    subscription_cancel_at_period_end: sub.cancel_at_period_end ?? false,
    subscription_product_name: sub.product?.name ?? null,
    subscription_synced_at: new Date().toISOString(),
  };

  // Also keep polar_customer_id up to date
  if (sub.customer_id) {
    update.polar_customer_id = sub.customer_id;
  }

  const { error } = await adminClient
    .from("companies")
    .update(update)
    .eq("id", companyId);

  if (error) {
    console.error(`cacheSubscriptionState failed for company ${companyId}:`, error.message);
  } else {
    console.log(
      `Cached subscription state for company ${companyId}: status=${sub.status}, seats=${sub.seats}, period_end=${sub.current_period_end}`
    );
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const POLAR_WEBHOOK_SECRET = Deno.env.get("POLAR_WEBHOOK_SECRET");
  if (!POLAR_WEBHOOK_SECRET) {
    console.error("POLAR_WEBHOOK_SECRET is not configured");
    return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();

  const isValid = await verifyPolarSignature(rawBody, req.headers, POLAR_WEBHOOK_SECRET);
  if (!isValid) {
    console.error("Webhook signature verification failed");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const eventType: string = event.type ?? "";
  console.log(`Polar webhook received: ${eventType}`);

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // -----------------------------------------------------------------
  // checkout.updated — fired when a checkout reaches a terminal state.
  // When status === "succeeded" the customer has paid; link the
  // polar_customer_id to our company record so subsequent portal/status
  // calls work immediately without needing the polling fallback.
  // -----------------------------------------------------------------
  if (eventType === "checkout.updated") {
    const checkout = event.data;
    if (checkout?.status === "succeeded") {
      const customerId: string | undefined = checkout.customer_id;
      const externalId: string | undefined = checkout.customer_metadata?.company_id
        ?? checkout.metadata?.company_id
        ?? checkout.external_customer_id;

      if (customerId && externalId) {
        const { error } = await adminClient
          .from("companies")
          .update({ polar_customer_id: customerId })
          .eq("id", externalId)
          .is("polar_customer_id", null); // only write if not already set

        if (error) {
          console.error("Failed to link polar_customer_id after checkout:", error.message);
        } else {
          console.log(`Linked polar_customer_id ${customerId} to company ${externalId}`);
        }
      } else {
        console.warn("checkout.updated: missing customer_id or company_id in metadata", {
          customerId,
          externalId,
          metadata: checkout.metadata,
          customerMetadata: checkout.customer_metadata,
        });
      }
    }
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // -----------------------------------------------------------------
  // subscription.created — a new subscription was created.
  // Cache the full subscription state so the billing page has
  // instant data without an additional Polar API call.
  // -----------------------------------------------------------------
  if (eventType === "subscription.created") {
    const sub = event.data;
    const companyId = await resolveCompanyId(adminClient, sub);

    if (companyId) {
      await cacheSubscriptionState(adminClient, companyId, sub);
    } else {
      console.warn("subscription.created: could not resolve company from event", {
        customerId: sub?.customer_id,
        externalId: sub?.customer?.external_id,
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // -----------------------------------------------------------------
  // subscription.updated — seat/plan changes, billing renewal,
  // cancellation scheduled, trial converted to paid, etc.
  // This is the primary event for keeping local state in sync with Polar.
  // Cache all relevant fields so the app reflects changes immediately.
  // -----------------------------------------------------------------
  if (eventType === "subscription.updated") {
    const sub = event.data;
    const companyId = await resolveCompanyId(adminClient, sub);

    if (companyId) {
      await cacheSubscriptionState(adminClient, companyId, sub);
    } else {
      console.warn("subscription.updated: could not resolve company from event", {
        customerId: sub?.customer_id,
        externalId: sub?.customer?.external_id,
      });
    }

    console.log(
      `subscription.updated: status=${sub?.status}, seats=${sub?.seats}, cancel_at_period_end=${sub?.cancel_at_period_end}`
    );
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // -----------------------------------------------------------------
  // subscription.canceled — customer cancelled; subscription will
  // remain active until period_end. Update the cache to reflect this
  // so the billing page shows the cancellation notice immediately.
  // -----------------------------------------------------------------
  if (eventType === "subscription.canceled") {
    const sub = event.data;
    const companyId = await resolveCompanyId(adminClient, sub);

    if (companyId) {
      await cacheSubscriptionState(adminClient, companyId, sub);
    }

    console.log(`subscription.canceled: customer_id=${sub?.customer_id}`);
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // -----------------------------------------------------------------
  // subscription.revoked — subscription ended (non-payment or hard
  // cancellation). Mark as inactive in the local cache.
  // -----------------------------------------------------------------
  if (eventType === "subscription.revoked") {
    const sub = event.data;
    const companyId = await resolveCompanyId(adminClient, sub);

    if (companyId) {
      // Polar sends status="canceled" on revoked events too — override to
      // make it clear this subscription is fully ended.
      await cacheSubscriptionState(adminClient, companyId, {
        ...sub,
        status: "inactive",
      });
    }

    console.log(`subscription.revoked: customer_id=${sub?.customer_id}`);
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // -----------------------------------------------------------------
  // order.created — payment received. No action needed; subscription
  // events cover everything we care about.
  // -----------------------------------------------------------------
  if (eventType === "order.created") {
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Unknown event type — acknowledge without error so Polar doesn't retry
  console.log(`Unhandled Polar event type: ${eventType}`);
  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
