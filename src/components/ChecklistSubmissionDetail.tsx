import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CheckCircle2, XCircle, Clock, User, ClipboardList, UserCheck, Camera, ExternalLink, StickyNote, Paperclip, Timer, History } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { normalizeItems } from "@/lib/checklist-utils";
import { useState } from "react";
import VersionHistoryDialog from "@/components/VersionHistoryDialog";

interface Attachment {
  path: string;
  name: string;
  uploaded_at: string;
}

function getAttachmentsMap(raw: unknown): Record<string, Attachment[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, Attachment[]>;
}

function getPublicUrl(path: string) {
  return supabase.storage.from("audit-evidence").getPublicUrl(path).data.publicUrl;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive"; icon: typeof CheckCircle2 }> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  approved: { label: "Approved", variant: "default", icon: CheckCircle2 },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
};

export default function ChecklistSubmissionDetail({ basePath }: { basePath: string }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [reviewNote, setReviewNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: sub, isLoading } = useQuery({
    queryKey: ["checklist-submission-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_submissions")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const userId = sub?.user_id;
  const completedById = sub?.completed_by;
  const templateId = sub?.template_id;
  const blockId = sub?.block_id;
  const sourceId = sub?.lesson_id;

  const { data: profile } = useQuery({
    queryKey: ["profile-detail", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("user_id", userId!).single();
      return data;
    },
    enabled: !!userId,
  });

  const { data: completedByProfile } = useQuery({
    queryKey: ["profile-detail", completedById],
    queryFn: async () => {
      if (!completedById || completedById === userId) return null;
      const { data } = await supabase.from("profiles").select("full_name").eq("user_id", completedById).single();
      return data;
    },
    enabled: !!completedById && completedById !== userId,
  });

  const { data: template } = useQuery({
    queryKey: ["template-detail", templateId],
    queryFn: async () => {
      const { data } = await supabase.from("checklist_templates").select("title, items").eq("id", templateId!).single();
      return data;
    },
    enabled: !!templateId,
  });

  const { data: block } = useQuery({
    queryKey: ["block-detail", blockId],
    queryFn: async () => {
      const { data } = await supabase.from("lesson_content").select("title, options").eq("id", blockId!).single();
      return data;
    },
    enabled: !!blockId,
  });

  const { data: source } = useQuery({
    queryKey: ["source-detail", sourceId],
    queryFn: async () => {
      const { data } = await supabase.from("lessons").select("title").eq("id", sourceId!).single();
      return data;
    },
    enabled: !!sourceId,
  });

  const reviewMutation = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase
        .from("checklist_submissions")
        .update({ status, reviewed_by: user!.id, reviewed_at: new Date().toISOString(), reviewer_note: reviewNote || null })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ["checklist-submission-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["checklist-submissions-review"] });
      queryClient.invalidateQueries({ queryKey: ["mgr-checklist-submissions"] });
      toast.success(`Submission ${status}`);
    },
  });

  if (isLoading || !sub) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  const snapshot = (sub as any).template_snapshot as { title?: string; items?: any[] } | null;
  const title = snapshot?.title || template?.title || block?.title || (sub as any).template_title || "Checklist";
  const items = normalizeItems(snapshot?.items || template?.items || block?.options);
  const checkedItems = Array.isArray(sub.checked_items) ? (sub.checked_items as string[]) : [];
  const attachmentsMap = getAttachmentsMap(sub.attachments);
  const isTrainerDriven = sub.completed_by && sub.completed_by !== sub.user_id;
  const statusInfo = statusConfig[sub.status] || statusConfig.pending;
  const StatusIcon = statusInfo.icon;
  const isTemplate = !!sub.template_id;

  // Flat attachments for legacy format
  const flatAttachments = Array.isArray(sub.attachments) ? (sub.attachments as unknown as Attachment[]) : [];
  const hasMapAttachments = Object.keys(attachmentsMap).length > 0 && !Array.isArray(sub.attachments);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back + breadcrumb */}
      <button
        onClick={() => navigate(`${basePath}/checklists`)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Checklists
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-extrabold">{title}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <ClipboardList className="h-4 w-4" />
            <span>{isTemplate ? "Standalone Checklist" : source?.title || "Checklist"}</span>
            <span>·</span>
            <span>{format(new Date(sub.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
            {(sub as any).duration_seconds != null && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Timer className="h-3.5 w-3.5" />
                  {Math.round((sub as any).duration_seconds / 60)} min
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sub.template_id && (
            <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={() => setHistoryOpen(true)}>
              <History className="h-3.5 w-3.5" /> Version History
            </Button>
          )}
          <Badge variant={statusInfo.variant} className="rounded-lg gap-1 text-sm px-3 py-1">
            <StatusIcon className="h-4 w-4" />
            {statusInfo.label}
          </Badge>
        </div>
      </div>

      {/* Submitter info */}
      <Card className="rounded-2xl">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-display font-bold text-sm">{profile?.full_name || "Unknown"}</span>
            {isTrainerDriven && completedByProfile && (
              <Badge variant="outline" className="rounded-lg text-xs gap-1">
                <UserCheck className="h-3 w-3" />
                Completed by {completedByProfile.full_name}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Checklist items */}
      <Card className="rounded-2xl">
        <CardContent className="p-5 space-y-3">
          <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide">Checklist Items</h2>
          <div className="space-y-2">
            {items.map((item, i) => {
              const isChecked = checkedItems.includes(item.text);
              const photos = hasMapAttachments ? (attachmentsMap[String(i)] || []) : [];
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    {isChecked ? (
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                    )}
                    <span className={isChecked ? "" : "text-muted-foreground"}>{item.text}</span>
                    {item.requires_photo && <Camera className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                  </div>
                  {photos.length > 0 && (
                    <div className="flex flex-wrap gap-2 ml-6">
                      {photos.map((photo, pi) => (
                        <a
                          key={pi}
                          href={getPublicUrl(photo.path)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative w-20 h-20 rounded-xl overflow-hidden border hover:ring-2 hover:ring-primary/50 transition-shadow group"
                        >
                          <img src={getPublicUrl(photo.path)} alt={photo.name} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <ExternalLink className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Flat attachments (legacy) */}
          {Array.isArray(sub.attachments) && flatAttachments.length > 0 && (
            <div className="pt-3 border-t space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" />
                <span>{flatAttachments.length} photo(s)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {flatAttachments.map((att, i) => (
                  <a key={i} href={getPublicUrl(att.path)} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-xl overflow-hidden border hover:ring-2 hover:ring-primary transition-shadow">
                    <img src={getPublicUrl(att.path)} alt={att.name} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {sub.notes && (
        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-2">
            <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <StickyNote className="h-4 w-4" /> Staff Notes
            </h2>
            <p className="text-sm">{sub.notes}</p>
          </CardContent>
        </Card>
      )}

      {sub.reviewer_note && (
        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-2">
            <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide">Reviewer Notes</h2>
            <p className="text-sm italic">{sub.reviewer_note}</p>
          </CardContent>
        </Card>
      )}

      {/* Review actions */}
      {sub.status === "pending" && (
        <Card className="rounded-2xl ">
          <CardContent className="p-5 space-y-4">
            <h2 className="font-display font-bold text-sm">Review This Submission</h2>
            <Textarea
              placeholder="Optional note..."
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              className="rounded-xl text-sm h-20"
            />
            <div className="flex gap-2">
              <Button onClick={() => reviewMutation.mutate("approved")} className="rounded-xl gap-1 flex-1" disabled={reviewMutation.isPending}>
                <CheckCircle2 className="h-4 w-4" /> Approve
              </Button>
              <Button variant="outline" onClick={() => reviewMutation.mutate("rejected")} className="rounded-xl gap-1 flex-1 text-destructive hover:text-destructive" disabled={reviewMutation.isPending}>
                <XCircle className="h-4 w-4" /> Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sub.template_id && (
        <VersionHistoryDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          templateId={sub.template_id}
          templateTitle={title}
        />
      )}
    </div>
  );
}
