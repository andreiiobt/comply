import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { itemText } from "@/lib/checklist-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckSquare, CheckCircle2, XCircle, Clock, User, BookOpen, UserCheck, Paperclip, StickyNote, ClipboardList, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useSupervisorStaff } from "@/hooks/useSupervisorStaff";

export default function SupervisorChecklists() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { staffIds } = useSupervisorStaff();
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [filterMode, setFilterMode] = useState<string>("all");

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["sup-checklist-submissions", staffIds],
    queryFn: async () => {
      if (!staffIds.length) return [];
      const { data, error } = await supabase
        .from("checklist_submissions")
        .select("*")
        .in("user_id", staffIds)
        .neq("status", "draft")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: staffIds.length > 0,
  });

  const userIds = [...new Set(submissions.flatMap((s) => [s.user_id, s.completed_by].filter(Boolean)))];
  const { data: profiles = [] } = useQuery({
    queryKey: ["sup-profiles-review", userIds],
    queryFn: async () => {
      if (!userIds.length) return [];
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      return data || [];
    },
    enabled: userIds.length > 0,
  });

  const templateIds = [...new Set(submissions.map((s: any) => s.template_id).filter(Boolean))];
  const { data: templateMap = {} } = useQuery({
    queryKey: ["sup-templates-review", templateIds],
    queryFn: async () => {
      if (!templateIds.length) return {};
      const { data } = await supabase.from("checklist_templates").select("id, title, items").in("id", templateIds);
      const map: Record<string, { title: string; items: string[] }> = {};
      (data || []).forEach((t) => { map[t.id] = { title: t.title, items: Array.isArray(t.items) ? t.items.map(itemText) : [] }; });
      return map;
    },
    enabled: templateIds.length > 0,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("checklist_submissions")
        .update({ status, reviewed_by: user!.id, reviewed_at: new Date().toISOString(), reviewer_note: reviewNote[id] || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["sup-checklist-submissions"] });
      toast.success(`Submission ${status}`);
    },
  });

  const getName = (userId: string | null) => {
    if (!userId) return null;
    return profiles.find((p) => p.user_id === userId)?.full_name || "Unknown";
  };
  const getTemplateMeta = (id: string | null) => { if (!id) return null; return (templateMap as any)[id] || null; };

  const getSubmissionLabel = (sub: any) => {
    const tpl = getTemplateMeta(sub.template_id);
    if (tpl) return { source: tpl.title, items: tpl.items };
    return { source: "Checklist", items: [] };
  };

  const filtered = submissions.filter((s) => {
    if (filterMode === "self") return !s.completed_by || s.completed_by === s.user_id;
    if (filterMode === "trainer") return s.completed_by && s.completed_by !== s.user_id;
    return true;
  });

  const pendingSubmissions = filtered.filter((s) => s.status === "pending");
  const reviewedSubmissions = filtered.filter((s) => s.status !== "pending");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
        <div className="h-32 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold">Checklists</h1>
          <p className="text-muted-foreground text-sm mt-1">Review checklist submissions from your department</p>
        </div>
        <Select value={filterMode} onValueChange={setFilterMode}>
          <SelectTrigger className="w-[160px] rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All submissions</SelectItem>
            <SelectItem value="self">Self-paced</SelectItem>
            <SelectItem value="trainer">Trainer-driven</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <h2 className="font-display font-bold text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-warning" /> Pending Review ({pendingSubmissions.length})
        </h2>
        {pendingSubmissions.length === 0 && (
          <Card className="rounded-2xl">
            <CardContent className="p-8 text-center text-muted-foreground">
              <CheckSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm">No pending submissions to review</p>
            </CardContent>
          </Card>
        )}
        {pendingSubmissions.map((sub) => {
          const { source, items: allItems } = getSubmissionLabel(sub);
          const checkedItems = Array.isArray(sub.checked_items) ? sub.checked_items as string[] : [];
          const isTrainerDriven = sub.completed_by && sub.completed_by !== sub.user_id;

          return (
            <Card key={sub.id} className="rounded-2xl  cursor-pointer  transition-shadow" onClick={() => navigate(`/supervisor/checklists/${sub.id}`)}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-display font-bold text-sm">{getName(sub.user_id)}</span>
                      {isTrainerDriven && (
                        <Badge variant="outline" className="rounded-lg text-xs gap-1">
                          <UserCheck className="h-3 w-3" />Completed by {getName(sub.completed_by)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ClipboardList className="h-3.5 w-3.5" />
                      <span>{source}</span>
                    </div>
                  </div>
                  <Badge variant="secondary" className="rounded-lg"><Clock className="h-4 w-4 mr-1" />Pending</Badge>
                </div>

                <div className="space-y-1.5">
                  {allItems.map((item: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {checkedItems.includes(item) ? <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> : <XCircle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />}
                      <span className={checkedItems.includes(item) ? "" : "text-muted-foreground"}>{item}</span>
                    </div>
                  ))}
                </div>

                {sub.notes && (
                  <div className="flex items-start gap-2 text-sm bg-muted/50 rounded-xl p-3">
                    <StickyNote className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-muted-foreground">{sub.notes}</p>
                  </div>
                )}

                <div className="text-xs text-muted-foreground">Submitted: {new Date(sub.created_at).toLocaleDateString()}</div>

                <Textarea
                  placeholder="Optional note..."
                  value={reviewNote[sub.id] || ""}
                  onChange={(e: any) => setReviewNote((prev: any) => ({ ...prev, [sub.id]: e.target.value }))}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-xl text-sm h-16"
                />

                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button onClick={() => reviewMutation.mutate({ id: sub.id, status: "approved" })} className="rounded-xl gap-1 flex-1" disabled={reviewMutation.isPending}>
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </Button>
                  <Button variant="outline" onClick={() => reviewMutation.mutate({ id: sub.id, status: "rejected" })} className="rounded-xl gap-1 flex-1 text-destructive hover:text-destructive" disabled={reviewMutation.isPending}>
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {reviewedSubmissions.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display font-bold text-lg">Previously Reviewed</h2>
          {reviewedSubmissions.map((sub) => {
            const { source, items: allItems } = getSubmissionLabel(sub);
            const checkedItems = Array.isArray(sub.checked_items) ? sub.checked_items as string[] : [];

            return (
              <Card key={sub.id} className="rounded-2xl opacity-75 cursor-pointer  transition-shadow" onClick={() => navigate(`/supervisor/checklists/${sub.id}`)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="font-display font-semibold text-sm">{getName(sub.user_id)}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ClipboardList className="h-3.5 w-3.5" />
                        <span>{source}</span>
                      </div>
                    </div>
                    <Badge variant={sub.status === "approved" ? "default" : "destructive"} className="rounded-lg gap-1">
                      {sub.status === "approved" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      {sub.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
