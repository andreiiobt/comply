import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Users, Calendar, Loader2, ExternalLink, Zap } from "lucide-react";
import { toast } from "sonner";

const PRODUCTS = [
  {
    id: "535ad322-9d4a-421c-89cf-e6b9edb8989a",
    name: "Comply",
    price: "$25 AUD/location/month",
    description: "Compliance management platform with checklists, incidents, and reporting.",
  },
  {
    id: "20df231e-1d4f-440b-99cf-7ef548818306",
    name: "Comply",
    price: "$25 AUD/location/month",
    description: "Learning & training platform with paths, courses, and gamification.",
  },
];

export default function Billing() {
  const { profile } = useAuth();
  const { company } = useBranding();
  const queryClient = useQueryClient();

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

  const checkoutMutation = useMutation({
    mutationFn: async (productId: string) => {
      // First ensure the company is linked to Polar
      await supabase.functions.invoke("polar-create-customer", {
        body: { company_id: profile!.company_id },
      });

      const { data, error } = await supabase.functions.invoke("polar-checkout", {
        body: {
          company_id: profile!.company_id,
          product_id: productId,
          success_url: `${window.location.origin}/admin/billing?checkout_id={CHECKOUT_ID}`,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    },
    onError: () => {
      toast.error("Failed to start checkout");
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
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
        <Card className="rounded-2xl  -primary/30 bg-primary/5">
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
          {hasActiveSubscription && subscriptionData?.subscription ? (
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
                  Manage Subscription
                </Button>
              </div>

              {subscriptionData.subscription.cancel_at_period_end && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3">
                  <p className="text-sm text-destructive font-medium">
                    Subscription will cancel at the end of the current billing period.
                  </p>
                </div>
              )}

              <p className="text-sm text-muted-foreground pt-2">
                Manage your billing cycles, adjust locations, and view invoices directly in the Customer Portal. 
              </p>
            </div>
          ) : (
            <div className="text-center py-6">
              <CreditCard className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground mb-1">No active subscription</p>
              <p className="text-xs text-muted-foreground">
                Choose a plan below to activate your subscription.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Plans */}
      {!hasActiveSubscription && (
        <div>
          <h2 className="text-lg font-display font-semibold mb-3">Available Plans</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {PRODUCTS.map((product) => (
              <Card key={product.id} className="rounded-2xl  hover:-primary/50 transition-colors">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display text-lg">{product.name}</CardTitle>
                    <Zap className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">{product.description}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between">
                    <div>
                      <span className="text-2xl font-bold">$25</span>
                      <span className="text-muted-foreground text-sm"> AUD/location/month</span>
                      <p className="text-xs text-muted-foreground mt-1">1 month free trial included</p>
                    </div>
                    <Button
                      onClick={() => checkoutMutation.mutate(product.id)}
                      disabled={checkoutMutation.isPending}
                    >
                      {checkoutMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <ExternalLink className="h-4 w-4 mr-2" />
                      )}
                      Activate
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
