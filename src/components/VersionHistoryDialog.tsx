import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { History, Plus, Minus, Equal } from "lucide-react";
import { normalizeItems, type ChecklistItem } from "@/lib/checklist-utils";

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
  templateTitle: string;
}

interface Version {
  id: string;
  version_number: number;
  title: string;
  description: string | null;
  items: any;
  changed_by: string;
  changed_at: string;
  change_summary: string | null;
}

export default function VersionHistoryDialog({
  open, onOpenChange, templateId, templateTitle,
}: VersionHistoryDialogProps) {
  const { data: versions = [], isLoading } = useQuery({
    queryKey: ["template-versions", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_template_versions")
        .select("*")
        .eq("template_id", templateId!)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Version[];
    },
    enabled: !!templateId && open,
  });

  // Fetch profile names for changed_by
  const changerIds = [...new Set(versions.map((v) => v.changed_by))];
  const { data: profiles = [] } = useQuery({
    queryKey: ["version-profiles", changerIds.join(",")],
    queryFn: async () => {
      if (changerIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", changerIds);
      return data || [];
    },
    enabled: changerIds.length > 0 && open,
  });

  const profileMap: Record<string, string> = {};
  profiles.forEach((p: any) => { profileMap[p.user_id] = p.full_name; });

  function computeDiff(prev: ChecklistItem[], curr: ChecklistItem[]) {
    const prevTexts = new Set(prev.map((i) => i.text));
    const currTexts = new Set(curr.map((i) => i.text));
    const added = curr.filter((i) => !prevTexts.has(i.text));
    const removed = prev.filter((i) => !currTexts.has(i.text));
    const kept = curr.filter((i) => prevTexts.has(i.text));
    return { added, removed, kept };
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History — {templateTitle}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          {isLoading ? (
            <div className="space-y-3 p-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No version history yet.</p>
          ) : (
            <div className="space-y-4 p-1">
              {versions.map((v, idx) => {
                const currItems = normalizeItems(v.items);
                const prevVersion = versions[idx + 1];
                const prevItems = prevVersion ? normalizeItems(prevVersion.items) : [];
                const diff = idx < versions.length - 1 ? computeDiff(prevItems, currItems) : null;

                return (
                  <div key={v.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-mono">
                          v{v.version_number}
                        </Badge>
                        <span className="text-sm font-medium">{v.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(v.changed_at), "MMM d, yyyy HH:mm")}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      by {profileMap[v.changed_by] || "Unknown"}
                      {v.change_summary && <> — {v.change_summary}</>}
                    </p>

                    {/* Items list */}
                    <div className="text-xs space-y-0.5">
                      <p className="text-muted-foreground font-medium">{currItems.length} items</p>
                      {diff && (diff.added.length > 0 || diff.removed.length > 0) && (
                        <div className="space-y-0.5 mt-1">
                          {diff.added.map((item, i) => (
                            <div key={`add-${i}`} className="flex items-center gap-1 text-green-600">
                              <Plus className="h-3 w-3" /> {item.text}
                            </div>
                          ))}
                          {diff.removed.map((item, i) => (
                            <div key={`rem-${i}`} className="flex items-center gap-1 text-red-500 line-through">
                              <Minus className="h-3 w-3" /> {item.text}
                            </div>
                          ))}
                        </div>
                      )}
                      {diff && diff.added.length === 0 && diff.removed.length === 0 && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Equal className="h-3 w-3" /> No item changes (metadata only)
                        </div>
                      )}
                      {!diff && (
                        <div className="text-muted-foreground">Initial version</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}