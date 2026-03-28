import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckSquare, Camera, ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { normalizeItems, type ChecklistItem } from "@/lib/checklist-utils";

interface Template {
  id: string;
  title: string;
  description: string | null;
  items: any[];
}

interface FilePreview {
  file: File;
  url: string;
}

interface StaffChecklistFillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
}

export default function StaffChecklistFillDialog({
  open, onOpenChange, template,
}: StaffChecklistFillDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [checked, setChecked] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [itemFiles, setItemFiles] = useState<Record<number, FilePreview[]>>({});

  const items: ChecklistItem[] = normalizeItems(template?.items);
  const photoRequiredItems = items.reduce<number[]>((acc, item, idx) => {
    if (item.requires_photo) acc.push(idx);
    return acc;
  }, []);

  // Validation: all items checked + all photo-required checked items have photos
  const allChecked = checked.length === items.length && items.length > 0;
  const missingPhotos = photoRequiredItems.filter(
    (idx) => checked.includes(items[idx].text) && (!itemFiles[idx] || itemFiles[idx].length === 0)
  );
  const canSubmit = allChecked && missingPhotos.length === 0;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!template || !user) return;

      // Upload per-item photos
      const attachments: Record<string, { path: string; name: string; uploaded_at: string }[]> = {};
      for (const [idxStr, files] of Object.entries(itemFiles)) {
        const uploads: { path: string; name: string; uploaded_at: string }[] = [];
        for (const fp of files) {
          const ext = fp.file.name.split(".").pop() || "jpg";
          const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from("audit-evidence")
            .upload(path, fp.file, { contentType: fp.file.type });
          if (uploadErr) throw uploadErr;
          uploads.push({ path, name: fp.file.name, uploaded_at: new Date().toISOString() });
        }
        if (uploads.length > 0) attachments[idxStr] = uploads;
      }

      const { error } = await supabase.from("checklist_submissions").insert({
        user_id: user.id,
        template_id: template.id,
        template_title: template.title,
        checked_items: checked,
        status: "pending",
        notes: notes || null,
        attachments,
        template_snapshot: {
          title: template.title,
          description: template.description,
          items: normalizeItems(template.items),
        },
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-submissions"] });
      toast.success("Checklist submitted for review");
      handleClose();
    },
    onError: () => toast.error("Failed to submit checklist"),
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

  const handleClose = () => {
    setChecked([]);
    setNotes("");
    Object.values(itemFiles).flat().forEach((fp) => URL.revokeObjectURL(fp.url));
    setItemFiles({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-primary" />
            {template?.title || "Checklist"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {template?.description && (
            <p className="text-sm text-muted-foreground">{template.description}</p>
          )}

          <div className="flex items-center gap-3">
            <Progress value={items.length > 0 ? (checked.length / items.length) * 100 : 0} className="h-2 flex-1" />
            <span className="text-xs font-display font-bold text-muted-foreground tabular-nums">
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

                  {/* Per-item photo upload — shown when item requires photo and is checked */}
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

          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !canSubmit}
            className="w-full h-14 rounded-2xl text-base font-bold"
          >
            {submitMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting...</>
            ) : canSubmit ? "Submit for Review" : missingPhotos.length > 0 ? `${missingPhotos.length} photo(s) required` : `${items.length - checked.length} items remaining`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
