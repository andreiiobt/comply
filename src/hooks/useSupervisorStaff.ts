import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns the list of staff user_ids that share the supervisor's
 * location AND at least one custom role (department).
 */
export function useSupervisorStaff() {
  const { user, roles } = useAuth();
  const supervisorRole = roles.find((r) => r.role === "supervisor");
  const locationId = supervisorRole?.location_id;

  // Get supervisor's custom role ids
  const { data: supervisorCustomRoleIds = [] } = useQuery({
    queryKey: ["sup-custom-roles", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_custom_roles")
        .select("custom_role_id")
        .eq("user_id", user!.id);
      return (data || []).map((r) => r.custom_role_id);
    },
    enabled: !!user,
  });

  // Get staff at same location
  const { data: locationStaffIds = [] } = useQuery({
    queryKey: ["sup-location-staff", locationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("location_id", locationId!)
        .eq("role", "staff");
      return (data || []).map((r) => r.user_id);
    },
    enabled: !!locationId,
  });

  // Filter to staff who share at least one custom role
  const { data: staffIds = [], isLoading } = useQuery({
    queryKey: ["sup-dept-staff", locationStaffIds, supervisorCustomRoleIds],
    queryFn: async () => {
      if (!locationStaffIds.length || !supervisorCustomRoleIds.length) return locationStaffIds;
      const { data } = await supabase
        .from("user_custom_roles")
        .select("user_id")
        .in("user_id", locationStaffIds)
        .in("custom_role_id", supervisorCustomRoleIds);
      const matchedIds = new Set((data || []).map((r) => r.user_id));
      return locationStaffIds.filter((id) => matchedIds.has(id));
    },
    enabled: locationStaffIds.length > 0,
  });

  return { staffIds, locationId, loading: isLoading };
}
