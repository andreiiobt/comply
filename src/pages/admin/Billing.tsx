import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CreditCard, Users, Calendar, Loader2, ExternalLink, Zap,
  RefreshCcw, CheckCircle2, MapPin, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

export default function Billing() {
  const { profile } = useAuth();
  const { company } = useBranding();
  const queryClient = useQueryClient();

  // Detect return from Polar checkout and trigger a status refresh
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutId = params.get("checkout_id");
    if (checkoutId) {
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
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

  const subStatus = subscriptionData?.status;
  const hasActiveSubscription = subStatus === "active" || subStatus === "trialing";
  const isNotLinked = subStatus === "not_linked" || !subscriptionData;
  const isInactive = subStatus === "inactive";
  const trialActive =
    !!subscriptionData?.trial_ends_at &&
    new Date(subscriptionData.trial_ends_at) > new Date();
  const showSubscribeFlow = !isLoading && !isError && (isNotLinked || isInactive);

  // Fetch available products when the subscribe flow is shown
  const {
    data: productsData,
    isLoading: isProductsLoading,
    isError: isProductsError,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ["polar-products"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("polar-products");
      if (error) throw error;
      return data;
    },
    enabled: showSubscribeFlow,
    retry: 2,
  });

  // Current location count for seat estimate
  const { data: locationCount = 0 } = useQuery({
    queryKey: ["location-count", profile?.company_id],
    queryFn: async () => {
      const { count } = await supabase
        .from("locations")
        .select("*", { count: "exact", head: true })
        .eq("company_id", profile!.company_id);
      return count ?? 0;
    },
    enabled: showSubscribeFlow && !!profile?.company_id,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { data, error } = await supabase.functions.invoke("polar-checkout", {
        body: {
          company_id: profile!.company_id,
          product_id: productId,
          success_url: `${window.location.origin}/admin/billing?checkout_id={CHECKOUT_ID}`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      if (data?.checkout_url) window.location.href = data.checkout_url;
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to start checkout. Please try again.");
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("polar-customer-portal", {
        body: { company_id: profile!.company_id },
      });
      if (error) {
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
      if (data?.url) window.location.href = data.url;
    },
    onError: (error: any) => {
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
      toast.error("Failed to sync seats: " + (error.message || "Unknown error"));
    },
  });

  const products: any[] = productsData?.products ?? [];
  const primaryProduct = products.find((p) => p.prices?.some((pr: any) => pr.interval)) ?? products[0];
  const primaryPrice = primaryProduct?.prices?.find((pr: any) => pr.interval) ?? primaryProduct?.prices?.[0];
  const seats = Math.max(locationCount as number, 1);
  const estimatedTotal = primaryPrice ? primaryPrice.amount * seats : null;

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

      {/* Subscribe flow — shown when no active subscription */}
      {showSubscribeFlow && (
        <div className="space-y-4">
          {isInactive && !trialActive && (
            <Card className="rounded-2xl border-destructive/30 bg-destructive/5">
              <CardContent className="py-4">
                <p className="text-sm text-destructive font-medium">
                  Your subscription is no longer active. Subscribe below to restore full access.
                </p>
              </CardContent>
            </Card>
          )}

          {primaryProduct ? (
            <Card className="rounded-2xl border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="font-display text-xl">{primaryProduct.name}</CardTitle>
                    {primaryProduct.description && (
                      <p className="text-sm text-muted-foreground mt-1">{primaryProduct.description}</p>
                    )}
                  </div>
                  {primaryPrice && (
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-2xl font-display font-bold text-foreground">
                        {formatCurrency(primaryPrice.amount, primaryPrice.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        per location / {primaryPrice.interval ?? "month"}
                      </p>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <Separator />

                {/* Seat estimate */}
                <div className="rounded-xl bg-muted/40 p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">Your estimate</p>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{seats} location{seats !== 1 ? "s" : ""}</span>
                    </div>
                    {estimatedTotal !== null && primaryPrice && (
                      <span className="font-semibold text-foreground">
                        {formatCurrency(estimatedTotal, primaryPrice.currency)} / {primaryPrice.interval ?? "month"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Seats adjust automatically when you add or remove locations.
                  </p>
                </div>

                {/* Feature list */}
                <ul className="space-y-2">
                  {[
                    "Unlimited staff and managers per location",
                    "Checklist submissions and approvals",
                    "Incident reporting and analytics",
                    "Seats automatically updated as you grow",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>

                <Button
                  size="lg"
                  className="w-full rounded-xl font-bold text-base h-12"
                  onClick={() => checkoutMutation.mutate(primaryProduct.id)}
                  disabled={checkoutMutation.isPending}
                >
                  {checkoutMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="h-5 w-5 mr-2" />
                  )}
                  {isInactive ? "Reactivate subscription" : "Start subscription"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Secure checkout via Polar. Cancel anytime.
                </p>
              </CardContent>
            </Card>
          ) : (
            /* Fallback while products load or if they fail */
            <Card className="rounded-2xl border-dashed border-2 border-border/70">
              <CardContent className="py-10">
                <div className="flex flex-col items-center gap-4 text-center max-w-sm mx-auto">
                  <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                    {isProductsLoading ? (
                      <Loader2 className="h-7 w-7 text-muted-foreground animate-spin" />
                    ) : (
                      <CreditCard className="h-7 w-7 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-display font-semibold text-foreground text-lg">
                      {isInactive ? "Reactivate your subscription" : "No subscription yet"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {isProductsLoading
                        ? "Loading plan details..."
                        : "Could not load plan details."}
                    </p>
                  </div>
                  {isProductsError && (
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => refetchProducts()}
                      className="rounded-xl px-8 mt-2"
                    >
                      <RefreshCcw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Current Subscription (active or trialing) */}
      {hasActiveSubscription && (
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
                  Manage subscription
                </Button>
              </div>

              {subscriptionData?.subscription && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground py-2 border-y border-border/50">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>{subscriptionData.subscription.seats} location seats</span>
                  </div>
                  {subscriptionData.subscription.current_period_end && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>
                        Next renewal:{" "}
                        {new Date(subscriptionData.subscription.current_period_end).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {subscriptionData?.subscription?.cancel_at_period_end && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3">
                  <p className="text-sm text-destructive font-medium">
                    Subscription will cancel at the end of the current billing period.
                  </p>
                </div>
              )}

              <p className="text-sm text-muted-foreground pt-1">
                All subscription management, plan changes, and invoicing are handled securely
                through our Polar billing portal.
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
