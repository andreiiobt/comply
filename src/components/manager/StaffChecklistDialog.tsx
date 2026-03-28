import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckSquare, CheckCircle2, User, Camera, ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { normalizeItems, type ChecklistItem } from "@/lib/checklist-utils";

interface StaffChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffUser: { user_id: string; full_name: string } | null;
  block: { id: string; title: string | null; options: any; content: string | null } | null;
  lessonId: string;
  lessonTitle: string;
  existingSubmission?: {
    id: string;
    checked_items: any;
    status: string;
  } | null;
}

interface FilePreview {
  file: File;
  url: string;
}

export default function StaffChecklistDialog({
  open, onOpenChange, staffUser, block, lessonId, lessonTitle, existingSubmission
}: StaffChecklistDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const rawItems = Array.isArray(block?.options) ? block!.options : [];
  const items: ChecklistItem[] = normalizeItems(rawItems);

  const initialChecked = existingSubmission?.checked_items
    ? (Array.isArray(existingSubmission.checked_items) ? existingSubmission.checked_items as string[] : [])
    : [];
  const [checked, setChecked] = useState<string[]>(initialChecked);
  const [notes, setNotes] = useState("");
  const [itemFiles, setItemFiles] = useState<Record<number, FilePreview[]>>({});

  const allChecked = checked.length === items.length && items.length > 0;
  const photoRequiredItems = items.reduce<number[]>((acc, item, idx) => {
    if (item.requires_photo) acc.push(idx);
    return acc;
  }, []);
  const missingPhotos = photoRequiredItems.filter(
    (idx) => checked.includes(items[idx].text) && (!itemFiles[idx] || itemFiles[idx].length === 0)
  );
  const canSubmit = allChecked && missingPhotos.length === 0;

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!staffUser || !block || !user) return;

      const attachments: Record<string, { path: string; name: string; uploaded_at: string }[]> = {};
      for (const [idxStr, files] of Object.entries(itemFiles)) {
        const uploads: { path: string; name: string; uploaded_at: string }[] = [];
        for (const fp of files) {
          const ext = fp.file.name.split(".").pop() || "jpg";
          const path = `${staffUser.user_id}/${crypto.randomUUID()}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from("audit-evidence")
            .upload(path, fp.file, { contentType: fp.file.type });
          if (uploadErr) throw uploadErr;
          uploads.push({ path, name: fp.file.name, uploaded_at: new Date().toISOString() });
        }
        if (uploads.length > 0) attachments[idxStr] = uploads;
      }

      const { error } = await supabase
        .from("checklist_submissions")
        .upsert({
          user_id: staffUser.user_id,
          block_id: block.id,
          lesson_id: lessonId,
          checked_items: checked,
          status: "approved",
          completed_by: user.id,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          notes: notes || null,
          attachments,
          template_snapshot: block ? {
            title: block.title,
            items: normalizeItems(block.options),
          } : null,
        } as any, { onConflict: "user_id,block_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-checklists"] });
      queryClient.invalidateQueries({ queryKey: ["checklist-submissions-review"] });
      toast.success(`Checklist completed with ${staffUser?.full_name}`);
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to save checklist"),
  });

  const toggleItem = (itemText: string) => {
    setChecked((prev) => prev.includes(itemText) ? prev.filter((c) => c !== itemText) : [...prev, itemText]);
  };

  const handleFileChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) => {
      if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} exceeds 5MB limit`); return false; }
      return true;
    });
    setItemFiles((prev) => ({
      ...prev,
      [idx]: [...(prev[idx] || []), ...valid.map((file) => ({ file, url: URL.createObjectURL(file) }))],
    }));
    const ref = fileInputRefs.current[idx];
    if (ref) ref.value = "";
  };

  const removeFile = (itemIdx: number, fileIdx: number) => {
    setItemFiles((prev) => {
      const files = [...(prev[itemIdx] || [])];
      URL.revokeObjectURL(files[fileIdx].url);
      files.splice(fileIdx, 1);
      return { ...prev, [itemIdx]: files };
    });
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setChecked(initialChecked);
      setNotes("");
      Object.values(itemFiles).flat().forEach((fp) => URL.revokeObjectURL(fp.url));
      setItemFiles({});
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-primary" />
            Complete Together
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span className="font-display font-semibold text-foreground">{staffUser?.full_name}</span>
            <span>·</span>
            <span>{lessonTitle}</span>
          </div>

          {block?.title && <h3 className="font-display font-bold">{block.title}</h3>}
          {block?.content && <p className="text-sm text-muted-foreground">{block.content}</p>}

          <div className="flex items-center gap-3">
            <Progress value={items.length > 0 ? (checked.length / items.length) * 100 : 0} className="h-2 flex-1" />
            <span className="text-xs font-display font-bold text-muted-foreground">
              {checked.length}/{items.length}
            </span>
          </div>

          <div className="space-y-2">
            {items.map((item, i) => {
              const isChecked = checked.includes(item.text);
              const files = itemFiles[i] || [];
              const needsPhoto = item.requires_photo && isChecked;
              const photoMissing = item.requires_photo && isChecked && files.length === 0;
              return (
                <div key={i} className="space-y-1.5">
                  <button
                    onClick={() => toggleItem(item.text)}
                    className={`w-full p-4 rounded-2xl  text-left font-display font-semibold transition-all flex items-center gap-3 ${
                      isChecked ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"
                    }`}
                  >
                    <Checkbox checked={isChecked} className="pointer-events-none" />
                    <span className="flex-1">{item.text}</span>
                    {item.requires_photo && (
                      <Camera className={`h-4 w-4 shrink-0 ${photoMissing ? "text-destructive" : "text-muted-foreground"}`} />
                    )}
                  </button>

                  {needsPhoto && (
                    <div className="ml-10 space-y-1.5">
                      <input
                        ref={(el) => { fileInputRefs.current[i] = el; }}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileChange(i, e)}
                      />
                      <input
                        ref={(el) => { cameraInputRefs.current[i] = el; }}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleFileChange(i, e)}
                      />
                      {files.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {files.map((fp, fi) => (
                            <div key={fi} className="relative w-14 h-14 rounded-xl overflow-hidden border">
                              <img src={fp.url} alt={fp.file.name} className="w-full h-full object-cover" />
                              <button onClick={() => removeFile(i, fi)} className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={`rounded-xl gap-1.5 text-xs h-7 ${photoMissing ? "border-destructive text-destructive" : ""}`}
                          onClick={() => cameraInputRefs.current[i]?.click()}
                        >
                          <Camera className="h-3 w-3" />
                          Take Photo
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl gap-1.5 text-xs h-7"
                          onClick={() => fileInputRefs.current[i]?.click()}
                        >
                          <ImagePlus className="h-3 w-3" />
                          Gallery
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-display font-semibold">Audit Notes</Label>
            <Textarea
              placeholder="Add observations, comments, or context..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl text-sm min-h-[80px]"
            />
          </div>

          {existingSubmission && existingSubmission.status !== "draft" && (
            <Badge variant="secondary" className="rounded-lg gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Previously {existingSubmission.status}
            </Badge>
          )}

          <Button
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending || !canSubmit}
            className="w-full h-14 rounded-2xl text-base font-bold"
          >
            {completeMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Uploading...</>
            ) : canSubmit ? "Sign Off & Approve" : missingPhotos.length > 0 ? `${missingPhotos.length} photo(s) required` : `${items.length - checked.length} items remaining`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
