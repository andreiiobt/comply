import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Users, Calendar, Loader2, ExternalLink, Zap, RefreshCcw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function Billing() {
  const { profile } = useAuth();
  const { company } = useBranding();
  const queryClient = useQueryClient();

  // Detect return from Polar checkout and trigger a status refresh
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutId = params.get("checkout_id");
    if (checkoutId) {
      // Clean the URL without reloading
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
      // Refetch after a short delay to give Polar time to process
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["polar-subscription"] });
      }, 1500);
    }
  }, [queryClient]);

  const { data: subscriptionData, isLoading, isError } = useQuery({
    queryKey: ["polar-subscription", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("polar-subscription-status", {
        body: { company_id: profile!.company_id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
    retry: 1,
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("polar-customer-portal", {
        body: { company_id: profile!.company_id },
      });
      if (error) {
        // Extract the actual error body from Supabase's FunctionsHttpError wrapper
        let message = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) message = body.error;
        } catch {}
        throw new Error(message);
      }
      return data;
    },
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      console.error("Portal error:", error);
      toast.error(error.message || "Failed to open billing portal. Please try again.");
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("polar-sync-seats", {
        body: { company_id: profile!.company_id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data?.summary || "Subscription seats synchronised");
      queryClient.invalidateQueries({ queryKey: ["polar-subscription"] });
    },
    onError: (error: any) => {
      console.error("Sync error:", error);
      toast.error("Failed to sync seats: " + (error.message || "Unknown error"));
    },
  });

  const subStatus = subscriptionData?.status;
  const hasActiveSubscription = subStatus === "active" || subStatus === "trialing";
  const isNotLinked = subStatus === "not_linked" || !subscriptionData;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Billing</h1>
          <p className="text-muted-foreground">
            Manage your subscription for {company?.name || "your company"}
          </p>
        </div>

        {hasActiveSubscription && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="text-muted-foreground hover:text-foreground"
          >
            {syncMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCcw className="h-4 w-4 mr-2" />
            )}
            Refresh seat sync
          </Button>
        )}
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

      {/* Setup prompt for new companies */}
      {!isLoading && !isError && isNotLinked && (
        <Card className="rounded-2xl border-dashed border-2 border-border/70">
          <CardContent className="py-10">
            <div className="flex flex-col items-center gap-4 text-center max-w-sm mx-auto">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                <CreditCard className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-display font-semibold text-foreground text-lg">No subscription yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Set up your subscription to manage locations, staff, and modules. You will be taken to our
                  secure Polar billing portal to choose a plan.
                </p>
              </div>
              <Button
                size="lg"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                className="rounded-xl px-8 mt-2"
              >
                {portalMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-2" />
                )}
                Set up billing
              </Button>
              <p className="text-xs text-muted-foreground">
                Billed per location. Cancel anytime.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Subscription */}
      {(hasActiveSubscription || subStatus === "inactive") && (
        <Card className="rounded-2xl">
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
                  variant="outline"
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                >
                  {portalMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  {hasActiveSubscription ? "Manage subscription" : "Reactivate"}
                </Button>
              </div>

              {hasActiveSubscription && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground py-2 border-y border-border/50">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>{subscriptionData.subscription.seats} location seats</span>
                  </div>
                  {subscriptionData.subscription.current_period_end && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>Next renewal: {new Date(subscriptionData.subscription.current_period_end).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              )}

              {hasActiveSubscription && subscriptionData?.subscription?.cancel_at_period_end && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3">
                  <p className="text-sm text-destructive font-medium">
                    Subscription will cancel at the end of the current billing period.
                  </p>
                </div>
              )}

              <p className="text-sm text-muted-foreground pt-1">
                {hasActiveSubscription
                  ? "All subscription management, plan changes, and invoicing are handled securely through our Polar billing portal."
                  : "Your subscription is inactive. Click Reactivate to resume your plan."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle className="font-display">Current Subscription</CardTitle>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="h-4 w-48 bg-muted animate-pulse rounded" />
              <div className="h-4 w-64 bg-muted animate-pulse rounded" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <Card className="rounded-2xl border-destructive/30">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-destructive font-medium">
              Could not load subscription status. Please refresh the page.
            </p>
          </CardContent>
        </Card>
      )}

      {/* How billing works */}
      {!isLoading && (
        <Card className="rounded-2xl bg-muted/30 border-border/50">
          <CardContent className="py-5">
            <p className="text-sm font-medium text-foreground mb-3">How billing works</p>
            <ul className="space-y-2">
              {[
                "Pricing is based on the number of locations in your account",
                "Seats are automatically adjusted when you add or remove locations",
                "All payments and invoices are managed via the Polar portal",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
