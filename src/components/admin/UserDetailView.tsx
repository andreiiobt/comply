import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, CheckSquare, CheckCircle2, Clock, XCircle,
} from "lucide-react";
import { format } from "date-fns";

interface UserDetailViewProps {
  user: { user_id: string; full_name: string | null };
  onBack: () => void;
}

export default function UserDetailView({ user, onBack }: UserDetailViewProps) {
  const { data: submissions = [] } = useQuery({
    queryKey: ["admin-user-submissions", user.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("checklist_submissions")
        .select("*")
        .eq("user_id", user.user_id)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const templateIds = [...new Set(submissions.map((s) => s.template_id).filter(Boolean))];

  const { data: templateMap = {} } = useQuery({
    queryKey: ["admin-user-template-titles", templateIds],
    queryFn: async () => {
      if (!templateIds.length) return {};
      const { data } = await supabase.from("checklist_templates").select("id, title").in("id", templateIds);
      const map: Record<string, string> = {};
      (data || []).forEach((t) => { map[t.id] = t.title; });
      return map;
    },
    enabled: templateIds.length > 0,
  });

  const approved = submissions.filter((s) => s.status === "approved").length;
  const pending = submissions.filter((s) => s.status === "pending").length;
  const rejected = submissions.filter((s) => s.status === "rejected").length;

  const statusBadge = (status: string) => {
    if (status === "approved") return <Badge variant="default" className="rounded-lg text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Approved</Badge>;
    if (status === "pending") return <Badge variant="secondary" className="rounded-lg text-xs gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    if (status === "rejected") return <Badge variant="destructive" className="rounded-lg text-xs gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
    return <Badge variant="outline" className="rounded-lg text-xs">{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-bold">{user.full_name || "Unnamed"}</h1>
          <p className="text-muted-foreground text-sm">
            {submissions.length} submissions · {approved} approved
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: "Approved", value: approved, color: "text-primary" },
          { label: "Pending", value: pending, color: "text-muted-foreground" },
          { label: "Rejected", value: rejected, color: "text-destructive" },
        ].map((stat) => (
          <Card key={stat.label} className="rounded-2xl ">
            <CardContent className="p-3 text-center">
              <p className={`text-lg font-display font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Submissions list */}
      {submissions.length === 0 ? (
        <Card className="rounded-2xl  -dashed">
          <CardContent className="flex flex-col items-center py-12">
            <CheckSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No checklist submissions</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl ">
          <CardContent className="p-4 space-y-2">
            {submissions.map((sub) => {
              const tplTitle = sub.template_id ? (templateMap as any)[sub.template_id] : null;
              return (
                <div key={sub.id} className="flex items-center justify-between py-2.5 border-b last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-display font-semibold truncate">
                      {tplTitle || "Checklist"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(sub.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  {statusBadge(sub.status)}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
