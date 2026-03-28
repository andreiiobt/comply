import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, CheckSquare, CheckCircle2, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { useSupervisorStaff } from "@/hooks/useSupervisorStaff";

export default function SupervisorDashboard() {
  const { staffIds, locationId, loading: staffLoading } = useSupervisorStaff();

  const { data: submissions = [] } = useQuery({
    queryKey: ["sup-submissions", staffIds],
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
    queryKey: ["sup-staff-profiles", staffIds],
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
    queryKey: ["sup-overdue", locationId, staffIds],
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
    enabled: !!locationId && staffIds.length > 0,
  });

  const totalSubmissions = submissions.length;
  const approvedCount = submissions.filter((s: any) => s.status === "approved").length;
  const approvalRate = totalSubmissions > 0 ? Math.round((approvedCount / totalSubmissions) * 100) : 0;

  const nameMap: Record<string, string> = {};
  staffProfiles.forEach((p) => { nameMap[p.user_id] = p.full_name || "Unknown"; });

  const recentSubmissions = submissions.slice(0, 5);

  const stats = [
    { title: "Staff Members", value: staffIds.length.toString(), icon: Users, color: "text-primary" },
    { title: "Approval Rate", value: `${approvalRate}%`, icon: TrendingUp, color: "text-secondary" },
    { title: "Submissions", value: totalSubmissions.toString(), icon: CheckSquare, color: "text-accent" },
    { title: "Overdue", value: overdueCount.toString(), icon: AlertTriangle, color: overdueCount > 0 ? "text-destructive" : "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Supervisor Dashboard</h1>
        <p className="text-muted-foreground">Overview of your department's compliance status</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card className="rounded-2xl ">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl sm:text-3xl font-display font-bold ${stat.title === "Overdue" && overdueCount > 0 ? "text-destructive" : ""}`}>{stat.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {recentSubmissions.length > 0 && (
        <Card className="rounded-2xl ">
          <CardHeader>
            <CardTitle className="text-base font-display flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Recent Submissions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentSubmissions.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <span className="font-display font-semibold">{nameMap[c.user_id] || "Staff"}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${c.status === "approved" ? "text-primary" : c.status === "pending" ? "text-muted-foreground" : "text-destructive"}`}>
                    {c.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
