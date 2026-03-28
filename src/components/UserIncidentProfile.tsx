import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle, User, FileText } from "lucide-react";
import { format } from "date-fns";

const severityColor: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800 border-emerald-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

const statusColor: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 border-blue-200",
  investigating: "bg-amber-100 text-amber-800 border-amber-200",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  closed: "bg-muted text-muted-foreground",
};

export default function UserIncidentProfile({ basePath }: { basePath: string }) {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["user-roles", userId],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role, location_id").eq("user_id", userId!);
      return data || [];
    },
    enabled: !!userId,
  });

  const { data: incidents = [], isLoading: incidentsLoading } = useQuery({
    queryKey: ["user-incident-history", userId],
    queryFn: async () => {
      // Fetch reports where user is reporter, assigned_to, or in involved_user_ids
      const { data, error } = await supabase
        .from("incident_reports")
        .select("*")
        .or(`user_id.eq.${userId},assigned_to.eq.${userId},involved_user_ids.cs.["${userId}"]`)
        .order("incident_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const goBack = () => navigate(-1);

  if (profileLoading || !profile) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  const getRoleInIncident = (r: any) => {
    const labels: string[] = [];
    if (r.user_id === userId) labels.push("Reporter");
    if (r.assigned_to === userId) labels.push("Subject");
    const involved: string[] = Array.isArray(r.involved_user_ids) ? r.involved_user_ids : [];
    if (involved.includes(userId!)) labels.push("Involved");
    return labels;
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <button onClick={goBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* User Header */}
      <Card className="rounded-2xl">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl font-extrabold">{profile.full_name || "Unnamed User"}</h1>
              <div className="flex gap-1.5 mt-1">
                {roles.map((r, i) => (
                  <Badge key={i} variant="outline" className="text-xs capitalize">{r.role}</Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Incident History */}
      <div>
        <h2 className="font-display font-bold text-lg flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Incident History ({incidents.length})
        </h2>

        {incidentsLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading…</div>
        ) : incidents.length === 0 ? (
          <Card className="rounded-2xl  -dashed">
            <CardContent className="flex flex-col items-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">No incident reports found for this user.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {incidents.map((r: any) => {
              const roleLabels = getRoleInIncident(r);
              return (
                <Card
                  key={r.id}
                  className="rounded-2xl cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`${basePath}/incidents/${r.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-display font-semibold truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{r.description}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {format(new Date(r.incident_date), "MMM d, yyyy")}
                          </span>
                          {roleLabels.map((label) => (
                            <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0">{label}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className={`capitalize text-xs ${severityColor[r.severity] || ""}`}>
                          {r.severity}
                        </Badge>
                        <Badge variant="outline" className={`capitalize text-xs ${statusColor[r.status] || ""}`}>
                          {r.status}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
