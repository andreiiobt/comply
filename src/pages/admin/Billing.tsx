import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Users, Calendar, Loader2, ExternalLink, Zap } from "lucide-react";
import { toast } from "sonner";

export default function Billing() {
  const { profile } = useAuth();
  const { company } = useBranding();

  const { data: subscriptionData, isLoading } = useQuery({
    queryKey: ["polar-subscription", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("polar-subscription-status", {
        body: { company_id: profile!.company_id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      // First ensure the company is linked to Polar
      await supabase.functions.invoke("polar-create-customer", {
        body: { company_id: profile!.company_id },
      });

      const { data, error } = await supabase.functions.invoke("polar-customer-portal", {
        body: { company_id: profile!.company_id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => toast.error("Failed to open customer portal"),
  });

  const subStatus = subscriptionData?.status;
  const hasActiveSubscription = subStatus === "active" || subStatus === "trialing";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription for {company?.name || "your company"}
        </p>
      </div>

      {/* Trial Status */}
      {subscriptionData?.trial_ends_at && !hasActiveSubscription && (
        <Card className="rounded-2xl border-primary/30 bg-primary/5">
          <CardContent className="py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-display font-semibold text-foreground">Free Trial</p>
                  <p className="text-sm text-muted-foreground">
                    {(() => {
                      const daysLeft = Math.ceil(
                        (new Date(subscriptionData.trial_ends_at).getTime() - Date.now()) / 86400000
                      );
                      return daysLeft > 0
                        ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining — expires ${new Date(subscriptionData.trial_ends_at).toLocaleDateString()}`
                        : `Expired on ${new Date(subscriptionData.trial_ends_at).toLocaleDateString()}`;
                    })()}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  Math.ceil((new Date(subscriptionData.trial_ends_at).getTime() - Date.now()) / 86400000) > 0
                    ? "bg-primary/10 text-primary"
                    : "bg-destructive/10 text-destructive"
                }
              >
                {Math.ceil((new Date(subscriptionData.trial_ends_at).getTime() - Date.now()) / 86400000) > 0
                  ? "Active Trial"
                  : "Expired"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Subscription */}
      <Card className="rounded-2xl ">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle className="font-display">Current Subscription</CardTitle>
          </div>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {hasActiveSubscription && subscriptionData?.subscription ? (
                  <>
                    <span className="text-lg font-semibold">
                      {subscriptionData.product?.name || "Subscription"}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        subStatus === "active"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                      }
                    >
                      {subStatus === "trialing" ? "Trial" : "Active"}
                    </Badge>
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-muted-foreground">
                      No active subscription
                    </span>
                    <Badge variant="outline" className="bg-muted text-muted-foreground">
                      Inactive
                    </Badge>
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant={hasActiveSubscription ? "outline" : "default"}
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                className={!hasActiveSubscription ? "rounded-xl" : ""}
              >
                {portalMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-2" />
                )}
                Manage Subscription
              </Button>
            </div>

            {hasActiveSubscription && subscriptionData?.subscription?.cancel_at_period_end && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive font-medium">
                  Subscription will cancel at the end of the current billing period.
                </p>
              </div>
            )}

            <p className="text-sm text-muted-foreground pt-2">
              All subscription management, plan changes, and invoicing are handled securely through our Polar billing portal.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
