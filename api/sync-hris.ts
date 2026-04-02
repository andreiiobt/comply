import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify this is a legitimate cron call
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers["authorization"];
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Find all companies with an active HRIS integration
  const { data: integrations, error } = await supabase
    .from("hris_integrations")
    .select("company_id")
    .eq("is_active", true);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!integrations || integrations.length === 0) {
    return res.status(200).json({ synced: 0, message: "No active HRIS integrations found" });
  }

  const results: Array<{ company_id: string; success: boolean; detail: any }> = [];

  for (const integration of integrations) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/merge-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ company_id: integration.company_id }),
      });

      const data = await response.json();
      results.push({ company_id: integration.company_id, success: response.ok, detail: data });
    } catch (err: any) {
      results.push({ company_id: integration.company_id, success: false, detail: err.message });
    }
  }

  return res.status(200).json({
    synced: results.filter((r) => r.success).length,
    total: results.length,
    results,
  });
}
