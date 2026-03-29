import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { addDays, isWithinInterval, isPast } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

interface UserLicense {
  id: string;
  user_id: string;
  company_id: string;
  license_name: string;
  license_number: string | null;
  expires_at: string | null;
  document_url: string | null;
}

export function useExpiryCheck() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user || !profile?.company_id) return;

    const checkExpiries = async () => {
      // 1. Get all user licenses
      const { data: licenses } = await supabase
        .from("user_licenses" as any)
        .select("*")
        .eq("user_id", user.id);

      if (!licenses) return;
      const typedLicenses = (licenses as unknown) as UserLicense[];

      const thirtyDaysFromNow = addDays(new Date(), 30);

      for (const lic of typedLicenses) {
        if (!lic.expires_at) continue;
        
        const expiryDate = new Date(lic.expires_at);
        const isExpiringSoon = isWithinInterval(expiryDate, { 
          start: new Date(), 
          end: thirtyDaysFromNow 
        });
        const isAlreadyExpired = isPast(expiryDate);

        if (isExpiringSoon || isAlreadyExpired) {
          const type = isAlreadyExpired ? "error" : "warning";
          const title = isAlreadyExpired ? "License Expired" : "License Expiring Soon";
          const message = isAlreadyExpired 
            ? `Your license "${lic.license_name}" has expired. Please upload a new one.` 
            : `Your license "${lic.license_name}" will expire on ${new Date(lic.expires_at).toLocaleDateString()}.`;

          // 2. Check if a notification for this license expiry already exists
          const { data: existing } = await supabase
            .from("notifications" as any)
            .select("id")
            .eq("user_id", user.id)
            .eq("title", title)
            .ilike("message", `%${lic.license_name}%`)
            .limit(1);

          if (!existing || existing.length === 0) {
            // 3. Insert notification
            await supabase.from("notifications" as any).insert({
              user_id: user.id,
              company_id: profile.company_id,
              title,
              message,
              type,
              link: "/compliance",
              status: "unread"
            });
            // Refresh counts
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            queryClient.invalidateQueries({ queryKey: ["notifications-full"] });
          }
        }
      }
    };

    checkExpiries();
  }, [user, profile?.company_id, queryClient]);
}
