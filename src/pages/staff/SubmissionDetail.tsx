import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, XCircle, Clock, ClipboardList, Camera, ExternalLink, StickyNote, Paperclip, Timer } from "lucide-react";
import { format } from "date-fns";
import { normalizeItems } from "@/lib/checklist-utils";
import { motion } from "framer-motion";

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
  pending: { label: "Pending Review", variant: "secondary", icon: Clock },
  approved: { label: "Approved", variant: "default", icon: CheckCircle2 },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
};

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

export default function SubmissionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: sub, isLoading } = useQuery({
    queryKey: ["staff-submission-detail", id],
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

  const templateId = sub?.template_id;

  const { data: template } = useQuery({
    queryKey: ["template-detail", templateId],
    queryFn: async () => {
      const { data } = await supabase.from("checklist_templates").select("title, items").eq("id", templateId!).single();
      return data;
    },
    enabled: !!templateId,
  });

  if (isLoading || !sub) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="h-6 bg-muted rounded w-1/3 animate-pulse" />
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          <div className="h-48 bg-muted rounded-2xl animate-pulse" />
          <div className="h-64 bg-muted rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  const title = template?.title || (sub as any).template_title || "Checklist";
  const items = normalizeItems(template?.items);
  const checkedItems = Array.isArray(sub.checked_items) ? (sub.checked_items as string[]) : [];
  const attachmentsMap = getAttachmentsMap(sub.attachments);
  const statusInfo = statusConfig[sub.status] || statusConfig.pending;
  const StatusIcon = statusInfo.icon;

  const flatAttachments = Array.isArray(sub.attachments) ? (sub.attachments as unknown as Attachment[]) : [];
  const hasMapAttachments = Object.keys(attachmentsMap).length > 0 && !Array.isArray(sub.attachments);

  const completedCount = items.filter((item) => checkedItems.includes(item.text)).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={() => navigate("/home")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-display font-bold truncate">{title}</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Status & meta */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
          <Card className="rounded-2xl">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(sub.created_at), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                  {(sub as any).duration_seconds != null && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Timer className="h-3.5 w-3.5" />
                      {Math.round((sub as any).duration_seconds / 60)} min
                    </p>
                  )}
                </div>
                <Badge variant={statusInfo.variant} className="rounded-lg gap-1.5 text-sm px-3 py-1.5">
                  <StatusIcon className="h-4 w-4" />
                  {statusInfo.label}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ClipboardList className="h-3.5 w-3.5" />
                <span>{completedCount}/{items.length} items completed</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Checklist items */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06, duration: 0.5, ease }}>
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
        </motion.div>

        {/* Notes */}
        {sub.notes && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5, ease }}>
            <Card className="rounded-2xl">
              <CardContent className="p-5 space-y-2">
                <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <StickyNote className="h-4 w-4" /> Your Notes
                </h2>
                <p className="text-sm">{sub.notes}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {sub.reviewer_note && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.5, ease }}>
            <Card className="rounded-2xl">
              <CardContent className="p-5 space-y-2">
                <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide">Reviewer Notes</h2>
                <p className="text-sm italic">{sub.reviewer_note}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
