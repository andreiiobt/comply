import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import type { Tables } from "@/integrations/supabase/types";

type Company = Tables<"companies">;

interface BrandingContextValue {
  company: Company | null;
}

const BrandingContext = createContext<BrandingContextValue>({ company: null });

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { tenant } = useTenant();

  // If tenant is resolved from subdomain, use that
  // Otherwise fall back to querying by the user's company_id
  const { data: companyFromProfile = null } = useQuery({
    queryKey: ["company", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", profile!.company_id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id && !tenant,
  });

  const company = tenant || companyFromProfile;

  return (
    <BrandingContext.Provider value={{ company }}>
      {children}
    </BrandingContext.Provider>
  );
}
