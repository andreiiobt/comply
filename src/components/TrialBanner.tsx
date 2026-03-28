import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Clock, AlertTriangle } from "lucide-react";

export function TrialBanner() {
  const { profile, roles } = useAuth();

  const { data } = useQuery({
    queryKey: ["trial-status", profile?.company_id],
    queryFn: async () => {
      // Get trial dates
      const { data: company } = await supabase
        .from("companies")
        .select("trial_ends_at")
        .eq("id", profile!.company_id!)
        .single();

      // Check subscription status
      let hasActiveSubscription = false;
      try {
        const { data: subData } = await supabase.functions.invoke("polar-subscription-status", {
          body: { company_id: profile!.company_id },
        });
        hasActiveSubscription = subData?.status === "active";
      } catch {
        // Ignore — treat as no subscription
      }

      return {
        trialEndsAt: company?.trial_ends_at,
        hasActiveSubscription,
      };
    },
    enabled: !!profile?.company_id,
    staleTime: 5 * 60 * 1000,
  });

  if (!data || data.hasActiveSubscription) return null;

  const trialEndsAt = data.trialEndsAt ? new Date(data.trialEndsAt) : null;
  if (!trialEndsAt) return null;

  const now = new Date();
  const daysLeft = Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isExpired = daysLeft <= 0;
  const isAdmin = roles.some((r) => r.role === "admin");

  return (
    <div
      className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${
        isExpired
          ? "bg-destructive/10 text-destructive border-b border-destructive/20"
          : daysLeft <= 7
            ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-b border-yellow-500/20"
            : "bg-primary/5 text-primary border-b border-primary/10"
      }`}
    >
      {isExpired ? (
        <>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Your free trial has expired.</span>
        </>
      ) : (
        <>
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            {daysLeft === 1 ? "1 day" : `${daysLeft} days`} left in your free trial.
          </span>
        </>
      )}
      {isAdmin && (
        <Link
          to="/admin/billing"
          className="underline underline-offset-2 font-semibold hover:opacity-80"
        >
          {isExpired ? "Activate now" : "View plans"}
        </Link>
      )}
    </div>
  );
}
