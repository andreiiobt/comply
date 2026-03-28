import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import DailyComplianceOverview from "@/components/DailyComplianceOverview";

export default function ManagerDailyOverview() {
  const { roles } = useAuth();

  const locationIds = useMemo(() => {
    return roles
      .filter((r) => r.role === "manager" && r.location_id)
      .map((r) => r.location_id!);
  }, [roles]);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-display font-bold mb-6">Daily Overview</h1>
      <DailyComplianceOverview locationIds={locationIds} />
    </div>
  );
}
