import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DailyComplianceOverview from "@/components/DailyComplianceOverview";

export default function AdminDailyOverview() {
  const { profile } = useAuth();

  const { data: locations = [] } = useQuery({
    queryKey: ["all-location-ids", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id")
        .eq("company_id", profile!.company_id!);
      if (error) throw error;
      return data?.map((l) => l.id) || [];
    },
    enabled: !!profile?.company_id,
  });

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-display font-bold mb-6">Daily Overview</h1>
      <DailyComplianceOverview locationIds={locations} />
    </div>
  );
}
