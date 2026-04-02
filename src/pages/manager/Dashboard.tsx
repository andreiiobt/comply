import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Users, TrendingUp, CheckSquare, CheckCircle2, AlertTriangle, FileWarning } from "lucide-react";
import { StatsGrid, type StatItem } from "@/components/StatsGrid";
import { submissionStatusColor } from "@/lib/statusColors";

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const managerRole = roles.find((r) => r.role === "manager");
  const locationId = managerRole?.location_id;

  const { data: staffIds = [] } = useQuery({
    queryKey: ["mgr-staff-ids", locationId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("location_id", locationId!)
        .eq("role", "staff");
      const ids = (data || []).map((r) => r.user_id);
      // Include the manager's own submissions too
      if (user?.id && !ids.includes(user.id)) ids.push(user.id);
      return ids;
    },
    enabled: !!locationId,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["mgr-submissions", staffIds],
    queryFn: async () => {
      if (!staffIds.length) return [];
      const { data } = await supabase
        .from("checklist_submissions")
        .select("id, user_id, status, created_at")
        .in("user_id", staffIds)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: staffIds.length > 0,
  });

  const { data: staffProfiles = [] } = useQuery({
    queryKey: ["mgr-staff-profiles", staffIds],
    queryFn: async () => {
      if (!staffIds.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", staffIds);
      return data || [];
    },
    enabled: staffIds.length > 0,
  });

  const { data: overdueCount = 0 } = useQuery({
    queryKey: ["mgr-overdue", locationId],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data: allOverdue, error } = await supabase
        .from("checklist_assignments")
        .select("id, template_id, assign_type, assign_value")
        .not("due_date", "is", null)
        .lt("due_date", now)
        .eq("is_active", true);
      if (error) throw error;
      if (!allOverdue || allOverdue.length === 0) return 0;

      const relevant = allOverdue.filter(
        (a) => a.assign_type === "all" || (a.assign_type === "location" && a.assign_value === locationId)
      );
      if (relevant.length === 0) return 0;

      const templateIds = [...new Set(relevant.map((a) => a.template_id))];
      const { data: approvedSubs } = await supabase
        .from("checklist_submissions")
        .select("template_id")
        .in("template_id", templateIds)
        .in("user_id", staffIds.length > 0 ? staffIds : ["00000000-0000-0000-0000-000000000000"])
        .eq("status", "approved");

      const approvedTemplateIds = new Set((approvedSubs || []).map((s) => s.template_id));
      return relevant.filter((a) => !approvedTemplateIds.has(a.template_id)).length;
    },
    enabled: !!locationId,
  });

  const totalSubmissions = submissions.length;
  const approvedCount = submissions.filter((s: any) => s.status === "approved").length;
  const pendingSubmissions = submissions.filter((s: any) => s.status === "pending");
  const approvalRate = totalSubmissions > 0 ? Math.round((approvedCount / totalSubmissions) * 100) : 0;

  const nameMap: Record<string, string> = {};
  staffProfiles.forEach((p) => { nameMap[p.user_id] = p.full_name || "Unknown"; });

  // Pending first, then most recent non-pending, up to 5 total
  const recentSubmissions = [
    ...pendingSubmissions,
    ...submissions.filter((s: any) => s.status !== "pending"),
  ].slice(0, 5);

  const stats: StatItem[] = [
    { title: "Staff Members", value: staffIds.length.toString(), icon: Users, color: "text-primary" },
    { title: "Approval Rate", value: `${approvalRate}%`, icon: TrendingUp, color: "text-secondary" },
    { title: "Submissions", value: totalSubmissions.toString(), icon: CheckSquare, color: "text-accent" },
    { title: "Overdue", value: overdueCount.toString(), icon: AlertTriangle, color: overdueCount > 0 ? "text-destructive" : "text-muted-foreground", highlight: overdueCount > 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Manager Dashboard</h1>
          <p className="text-muted-foreground">Overview of your location's compliance status</p>
        </div>
        <Button onClick={() => navigate("/manager/report-incident")} variant="destructive" className="gap-2">
          <FileWarning className="h-4 w-4" /> Report Incident
        </Button>
      </div>

      <StatsGrid stats={stats} />

      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Submissions
              {pendingSubmissions.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold w-5 h-5">
                  {pendingSubmissions.length}
                </span>
              )}
            </CardTitle>
            <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => navigate("/manager/checklists")}>
              Review All
            </Button>
          </div>
          {pendingSubmissions.length > 0 && (
            <p className="text-xs text-destructive font-medium mt-1">
              {pendingSubmissions.length} submission{pendingSubmissions.length !== 1 ? "s" : ""} pending review
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-1 pt-0">
          {recentSubmissions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center">No submissions yet.</p>
          ) : (
            recentSubmissions.map((c: any) => (
              <div
                key={c.id}
                className="flex items-center justify-between text-sm py-2 border-b last:border-0 cursor-pointer hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors"
                onClick={() => navigate(`/manager/checklists/${c.id}`)}
              >
                <span className="font-display font-semibold">{nameMap[c.user_id] || "Staff"}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium capitalize ${submissionStatusColor(c.status)}`}>
                    {c.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
