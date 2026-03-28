import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, MapPin, CheckSquare, TrendingUp, AlertTriangle, FileWarning, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useBranding } from "@/contexts/BrandingProvider";
import { useAuth } from "@/contexts/AuthContext";
import WelcomeOnboardingModal from "@/components/WelcomeOnboardingModal";
import { useLocationData } from "@/hooks/useLocationData";
import { LocationCard } from "@/components/admin/LocationCard";

export default function AdminDashboard() {
  const { company } = useBranding();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { locations, locationStats, getLocationTags, isLoading: isLoadingLocations } = useLocationData(profile?.company_id);

  const { data: userCount = 0 } = useQuery({
    queryKey: ["stat-users"],
    queryFn: async () => {
      const { count, error } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: locationCount = 0 } = useQuery({
    queryKey: ["stat-locations"],
    queryFn: async () => {
      const { count, error } = await supabase.from("locations").select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: checklistCount = 0 } = useQuery({
    queryKey: ["stat-checklists"],
    queryFn: async () => {
      const { count, error } = await supabase.from("checklist_submissions").select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: approvalRate = 0 } = useQuery({
    queryKey: ["stat-approval"],
    queryFn: async () => {
      const { data, error } = await supabase.from("checklist_submissions").select("status");
      if (error) throw error;
      if (!data || data.length === 0) return 0;
      const approved = data.filter((s) => s.status === "approved").length;
      return Math.round((approved / data.length) * 100);
    },
  });

  const { data: overdueCount = 0 } = useQuery({
    queryKey: ["stat-overdue"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data: overdueAssignments, error } = await supabase
        .from("checklist_assignments")
        .select("id, template_id")
        .not("due_date", "is", null)
        .lt("due_date", now)
        .eq("is_active", true);
      if (error) throw error;
      if (!overdueAssignments || overdueAssignments.length === 0) return 0;

      const templateIds = [...new Set(overdueAssignments.map((a) => a.template_id))];
      const { data: approvedSubs } = await supabase
        .from("checklist_submissions")
        .select("template_id")
        .in("template_id", templateIds)
        .eq("status", "approved");

      const approvedTemplateIds = new Set((approvedSubs || []).map((s) => s.template_id));
      return overdueAssignments.filter((a) => !approvedTemplateIds.has(a.template_id)).length;
    },
  });

  const stats = [
    { title: "Total Users", value: userCount.toString(), icon: Users, color: "text-primary", href: "/admin/users" },
    { title: "Locations", value: locationCount.toString(), icon: MapPin, color: "text-secondary", href: "/admin/locations" },
    { title: "Submissions", value: checklistCount.toString(), icon: CheckSquare, color: "text-accent", href: "/admin/checklists" },
    { title: "Approval Rate", value: `${approvalRate}%`, icon: TrendingUp, color: "text-primary", href: "/admin/reports" },
    { title: "Overdue", value: overdueCount.toString(), icon: AlertTriangle, color: overdueCount > 0 ? "text-destructive" : "text-muted-foreground", href: "/admin/checklists" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your compliance platform</p>
        </div>
        <Button onClick={() => navigate("/admin/report-incident")} variant="destructive" className="gap-2">
          <FileWarning className="h-4 w-4" /> Report Incident
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat, i) => (
          <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card
              className={`rounded-2xl   transition-shadow ${stat.href ? "cursor-pointer" : ""}`}
              onClick={() => stat.href && navigate(stat.href)}
            >
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


      <Card className="rounded-2xl ">
        <CardHeader>
          <CardTitle className="font-display">Getting Started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground">Welcome to {company?.name || "Comply"}! Here's how to get started:</p>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Go to <strong>People → Locations</strong> to add your company locations</li>
            <li>Go to <strong>People → Users</strong> to invite managers and staff</li>
            <li>Go to <strong>Compliance → Checklists</strong> to review checklist submissions</li>
            <li>Go to <strong>Compliance → Reports</strong> to track compliance metrics</li>
            <li>Go to <strong>Settings → Branding</strong> to customize your look and feel</li>
          </ol>
        </CardContent>
      </Card>

      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-bold text-foreground">Locations Overview</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/locations")} className="text-sm">
            Manage All <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
        
        {isLoadingLocations ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="rounded-2xl  animate-pulse">
                <CardContent className="p-6 h-28" />
              </Card>
            ))}
          </div>
        ) : locations.length === 0 ? (
          <Card className="rounded-2xl  -dashed">
            <CardContent className="flex flex-col items-center py-12">
              <MapPin className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground mb-2">No locations added yet.</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/admin/locations")}>Create your first location</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {locations.slice(0, 6).map((loc: any, i: number) => (
              <LocationCard
                key={loc.id}
                location={loc}
                tags={getLocationTags(loc.id)}
                stats={locationStats[loc.id]}
                index={i}
                onClick={() => navigate(`/admin/locations?id=${loc.id}`)}
                showActions={false}
              />
            ))}
          </div>
        )}
      </div>

      {profile?.user_id && <WelcomeOnboardingModal userId={profile.user_id} />}
    </div>
  );
}