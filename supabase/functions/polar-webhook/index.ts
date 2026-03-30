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
  // Ensures polar_customer_id is stored even if checkout webhook
  // arrived late or was missed.
  // -----------------------------------------------------------------
  if (eventType === "subscription.created") {
    const sub = event.data;
    const customerId: string | undefined = sub?.customer_id;
    const externalId: string | undefined =
      sub?.customer?.external_id ?? sub?.metadata?.company_id;

    if (customerId && externalId) {
      const { error } = await adminClient
        .from("companies")
        .update({ polar_customer_id: customerId })
        .eq("id", externalId);

      if (error) {
        console.error("Failed to store polar_customer_id from subscription.created:", error.message);
      } else {
        console.log(`subscription.created: linked polar_customer_id ${customerId} to company ${externalId}`);
      }
    } else {
      console.warn("subscription.created: could not resolve company from event", {
        customerId,
        externalId,
        customerExternalId: sub?.customer?.external_id,
      });
    }
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // -----------------------------------------------------------------
  // subscription.updated — seat/plan changes, cancellation scheduled.
  // We don't cache subscription state locally (it's always read from
  // Polar's API), so just ensure the customer link is still correct.
  // -----------------------------------------------------------------
  if (eventType === "subscription.updated") {
    const sub = event.data;
    const customerId: string | undefined = sub?.customer_id;
    const externalId: string | undefined = sub?.customer?.external_id;

    if (customerId && externalId) {
      // Update link in case it was stale
      await adminClient
        .from("companies")
        .update({ polar_customer_id: customerId })
        .eq("id", externalId)
        .neq("polar_customer_id", customerId); // no-op if already correct
    }
    console.log(`subscription.updated: status=${sub?.status}, cancel_at_period_end=${sub?.cancel_at_period_end}`);
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // -----------------------------------------------------------------
  // subscription.canceled / subscription.revoked
  // Nothing to update in DB — status is read from Polar's API.
  // Just log and acknowledge.
  // -----------------------------------------------------------------
  if (eventType === "subscription.canceled" || eventType === "subscription.revoked") {
    const sub = event.data;
    console.log(`${eventType}: customer_id=${sub?.customer_id}, external_id=${sub?.customer?.external_id}`);
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
