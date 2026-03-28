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

export default function ManagerChecklists() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const queryClient = useQueryClient();
  const locationId = roles.find((r) => r.role === "manager")?.location_id;
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [filterMode, setFilterMode] = useState<string>("all");

  const { data: staffIds = [] } = useQuery({
    queryKey: ["mgr-checklist-staff", locationId],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("user_id").eq("location_id", locationId!).eq("role", "staff");
      return (data || []).map((r) => r.user_id);
    },
    enabled: !!locationId,
  });

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["mgr-checklist-submissions", staffIds],
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
    queryKey: ["mgr-profiles-review", userIds],
    queryFn: async () => {
      if (!userIds.length) return [];
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      return data || [];
    },
    enabled: userIds.length > 0,
  });

  // Legacy: lesson/block titles
  const lessonIds = [...new Set(submissions.map((s) => s.lesson_id).filter(Boolean))];
  const { data: lessons = [] } = useQuery({
    queryKey: ["mgr-lessons-review", lessonIds],
    queryFn: async () => {
      if (!lessonIds.length) return [];
      const { data } = await supabase.from("lessons").select("id, title").in("id", lessonIds);
      return data || [];
    },
    enabled: lessonIds.length > 0,
  });

  const blockIds = [...new Set(submissions.map((s) => s.block_id).filter(Boolean))];
  const { data: blocks = [] } = useQuery({
    queryKey: ["mgr-blocks-review", blockIds],
    queryFn: async () => {
      if (!blockIds.length) return [];
      const { data } = await supabase.from("lesson_content").select("id, title, options").in("id", blockIds);
      return data || [];
    },
    enabled: blockIds.length > 0,
  });

  // Template titles
  const templateIds = [...new Set(submissions.map((s: any) => s.template_id).filter(Boolean))];
  const { data: templateMap = {} } = useQuery({
    queryKey: ["mgr-templates-review", templateIds],
    queryFn: async () => {
      if (!templateIds.length) return {};
      const { data } = await supabase.from("checklist_templates").select("id, title, items").in("id", templateIds);
      const map: Record<string, { title: string; items: string[] }> = {};
      (data || []).forEach((t) => { map[t.id] = { title: t.title, items: Array.isArray(t.items) ? t.items.map(itemText) : [] }; });
      return map;
    },
    enabled: templateIds.length > 0,
  });

  // Fetch assignment due dates
  const { data: assignmentDueDates = [] } = useQuery({
    queryKey: ["mgr-assignment-due-dates", templateIds],
    queryFn: async () => {
      if (!templateIds.length) return [];
      const { data } = await supabase.from("checklist_assignments").select("template_id, due_date").in("template_id", templateIds);
      return data || [];
    },
    enabled: templateIds.length > 0,
  });

  const dueDateMap = useMemo(() => {
    const map: Record<string, string> = {};
    (assignmentDueDates as any[]).forEach((a) => {
      if (a.due_date) {
        if (!map[a.template_id] || new Date(a.due_date) < new Date(map[a.template_id])) {
          map[a.template_id] = a.due_date;
        }
      }
    });
    return map;
  }, [assignmentDueDates]);

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("checklist_submissions")
        .update({ status, reviewed_by: user!.id, reviewed_at: new Date().toISOString(), reviewer_note: reviewNote[id] || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["mgr-checklist-submissions"] });
      toast.success(`Submission ${status}`);
    },
  });

  const getName = (userId: string | null) => {
    if (!userId) return null;
    return profiles.find((p) => p.user_id === userId)?.full_name || "Unknown";
  };
  const getLessonTitle = (id: string | null) => { if (!id) return null; return lessons.find((l) => l.id === id)?.title || null; };
  const getBlock = (id: string | null) => { if (!id) return null; return blocks.find((b) => b.id === id) || null; };
  const getTemplateMeta = (id: string | null) => { if (!id) return null; return (templateMap as any)[id] || null; };

  const getSubmissionLabel = (sub: any) => {
    const tpl = getTemplateMeta(sub.template_id);
    if (tpl) return { source: tpl.title, items: tpl.items };
    const block = getBlock(sub.block_id);
    const allItems = Array.isArray(block?.options) ? block.options as string[] : [];
    return { source: `${getLessonTitle(sub.lesson_id) || "Lesson"} · ${block?.title || "Checklist"}`, items: allItems };
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
          <h1 className="font-display text-2xl font-extrabold"><h1 className="font-display text-2xl font-extrabold">Checklists</h1></h1>
          <p className="text-muted-foreground text-sm mt-1">Review checklist submissions from your team</p>
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
        {pendingSubmissions.map((sub) => <SubmissionCard key={sub.id} sub={sub} getSubmissionLabel={getSubmissionLabel} getName={getName} reviewNote={reviewNote} setReviewNote={setReviewNote} reviewMutation={reviewMutation} dueDateMap={dueDateMap} navigate={navigate} />)}
      </div>

      {reviewedSubmissions.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display font-bold text-lg">Previously Reviewed</h2>
          {reviewedSubmissions.map((sub) => {
            const { source, items: allItems } = getSubmissionLabel(sub);
            const checkedItems = Array.isArray(sub.checked_items) ? sub.checked_items as string[] : [];
            const isTrainerDriven = sub.completed_by && sub.completed_by !== sub.user_id;
            const isTemplate = !!(sub as any).template_id;

            return (
              <Card key={sub.id} className="rounded-2xl opacity-75 cursor-pointer  transition-shadow" onClick={() => navigate(`/manager/checklists/${sub.id}`)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-semibold text-sm">{getName(sub.user_id)}</span>
                        {isTrainerDriven && (
                          <Badge variant="outline" className="rounded-lg text-xs gap-1">
                            <UserCheck className="h-3 w-3" />{getName(sub.completed_by)}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {isTemplate ? <ClipboardList className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
                        <span>{source}</span>
                      </div>
                    </div>
                    <Badge variant={sub.status === "approved" ? "default" : "destructive"} className="rounded-lg gap-1">
                      {sub.status === "approved" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      {sub.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {allItems.map((item, i) => (
                      <Badge key={i} variant={checkedItems.includes(item) ? "default" : "outline"} className="rounded-lg text-xs">{item}</Badge>
                    ))}
                  </div>
                  {sub.reviewer_note && <p className="text-xs text-muted-foreground mt-2 italic">Note: {sub.reviewer_note}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubmissionCard({ sub, getSubmissionLabel, getName, reviewNote, setReviewNote, reviewMutation, dueDateMap, navigate }: any) {
  const { source, items: allItems } = getSubmissionLabel(sub);
  const checkedItems = Array.isArray(sub.checked_items) ? sub.checked_items as string[] : [];
  const isTrainerDriven = sub.completed_by && sub.completed_by !== sub.user_id;
  const isTemplate = !!sub.template_id;

  return (
    <Card className="rounded-2xl  cursor-pointer  transition-shadow" onClick={() => navigate(`/manager/checklists/${sub.id}`)}>
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
              {isTemplate ? <ClipboardList className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
              <span>{source}</span>
            </div>
          </div>
          <Badge variant="secondary" className="rounded-lg"><Clock className="h-4 w-4 mr-1" />Pending</Badge>
          {sub.template_id && dueDateMap[sub.template_id] && new Date(dueDateMap[sub.template_id]) < new Date() && (
            <Badge variant="destructive" className="rounded-lg gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" />
              Overdue · {format(new Date(dueDateMap[sub.template_id]), "MMM d")}
            </Badge>
          )}
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

        {Array.isArray(sub.attachments) && (sub.attachments as any[]).length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" />
              <span>{(sub.attachments as any[]).length} photo(s)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(sub.attachments as any[]).map((att: any, i: number) => {
                const { data } = supabase.storage.from("audit-evidence").getPublicUrl(att.path);
                return (
                  <a key={i} href={data.publicUrl} target="_blank" rel="noopener noreferrer" className="block w-16 h-16 rounded-xl overflow-hidden border hover:ring-2 hover:ring-primary transition-shadow">
                    <img src={data.publicUrl} alt={att.name} className="w-full h-full object-cover" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground">Submitted: {new Date(sub.created_at).toLocaleDateString()}</div>

        <Textarea
          placeholder="Optional note..."
          value={reviewNote[sub.id] || ""}
          onChange={(e: any) => setReviewNote((prev: any) => ({ ...prev, [sub.id]: e.target.value }))}
          className="rounded-xl text-sm h-16"
        />

        <div className="flex gap-2">
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
}
