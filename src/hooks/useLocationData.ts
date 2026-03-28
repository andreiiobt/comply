import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useLocationData(companyId?: string) {
  const enabled = !!companyId;

  const { data: locations = [], isLoading: isLoadingLocations } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
    enabled,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ["location-tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("location_tags").select("*").order("name");
      if (error) throw error;
      return data;
    },
    enabled,
  });

  const { data: tagAssignments = [] } = useQuery({
    queryKey: ["location-tag-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("location_tag_assignments").select("*");
      if (error) throw error;
      return data;
    },
    enabled,
  });

  const { data: incidentReports = [], isLoading: isLoadingIncidents } = useQuery({
    queryKey: ["all-incident-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled,
  });

  const { data: submissions = [], isLoading: isLoadingSubmissions } = useQuery({
    queryKey: ["all-checklist-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_submissions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled,
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, location_id");
      if (error) throw error;
      return data || [];
    },
    enabled,
  });

  // Build user→location map
  const userLocationMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    userRoles.forEach((ur: any) => {
      if (ur.location_id) map[ur.user_id] = ur.location_id;
    });
    return map;
  }, [userRoles]);

  // Stats per location
  const locationStats = useMemo(() => {
    const stats: Record<string, { incidents: { total: number; open: number; investigating: number; resolved: number }; submissions: { total: number; pending: number; approved: number; rejected: number } }> = {};
    
    locations.forEach((loc: any) => {
      stats[loc.id] = {
        incidents: { total: 0, open: 0, investigating: 0, resolved: 0 },
        submissions: { total: 0, pending: 0, approved: 0, rejected: 0 },
      };
    });

    incidentReports.forEach((r: any) => {
      if (r.location_id && stats[r.location_id]) {
        stats[r.location_id].incidents.total++;
        if (r.status === "open") stats[r.location_id].incidents.open++;
        if (r.status === "investigating") stats[r.location_id].incidents.investigating++;
        if (r.status === "resolved") stats[r.location_id].incidents.resolved++;
      }
    });

    submissions.forEach((s: any) => {
      const locId = userLocationMap[s.user_id];
      if (locId && stats[locId]) {
        stats[locId].submissions.total++;
        if (s.status === "pending") stats[locId].submissions.pending++;
        if (s.status === "approved") stats[locId].submissions.approved++;
        if (s.status === "rejected") stats[locId].submissions.rejected++;
      }
    });

    return stats;
  }, [locations, incidentReports, submissions, userLocationMap]);

  const getLocationTags = (locationId: string) => {
    const tagIds = tagAssignments.filter((ta: any) => ta.location_id === locationId).map((ta: any) => ta.tag_id);
    return tags.filter((t: any) => tagIds.includes(t.id));
  };

  return {
    locations,
    tags,
    tagAssignments,
    incidentReports,
    submissions,
    userRoles,
    userLocationMap,
    locationStats,
    getLocationTags,
    isLoading: isLoadingLocations || isLoadingIncidents || isLoadingSubmissions,
  };
}
