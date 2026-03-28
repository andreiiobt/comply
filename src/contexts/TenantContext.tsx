import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Company = Tables<"companies">;

interface TenantContextValue {
  tenant: Company | null;
  tenantSlug: string | null;
  isRootDomain: boolean;
  loading: boolean;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  tenantSlug: null,
  isRootDomain: true,
  loading: true,
});

export function useTenant() {
  return useContext(TenantContext);
}

function resolveSlug(): string | null {
  const hostname = window.location.hostname;

  // Local dev: use ?company=slug query param
  const params = new URLSearchParams(window.location.search);
  const paramSlug = params.get("company");
  if (paramSlug) return paramSlug;

  const parts = hostname.split(".");

  // localhost (no subdomain)
  if (hostname === "localhost" || hostname === "127.0.0.1") return null;

  // comply.iobt.com.au = root (4 parts)
  // acme.comply.iobt.com.au = subdomain (5 parts)
  if (hostname.endsWith(".comply.iobt.com.au")) {
    // Root: comply.iobt.com.au (4 parts)
    // Subdomain: acme.comply.iobt.com.au (5 parts)
    if (parts.length > 4) return parts[0];
    return null;
  }

  // Generic fallback for other custom domains: 2 parts = root, 3+ = subdomain
  if (parts.length > 2) return parts[0];

  return null;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const tenantSlug = resolveSlug();
  const isRootDomain = !tenantSlug;

  useEffect(() => {
    if (!tenantSlug) {
      setLoading(false);
      return;
    }

    supabase
      .rpc("get_company_by_slug", { _slug: tenantSlug })
      .then(({ data, error }) => {
        if (!error && data && Array.isArray(data) && data.length > 0) {
          setTenant(data[0] as Company);
        }
        setLoading(false);
      });
  }, [tenantSlug]);

  return (
    <TenantContext.Provider value={{ tenant, tenantSlug, isRootDomain, loading }}>
      {children}
    </TenantContext.Provider>
  );
}
