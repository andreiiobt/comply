import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CheckSquare, Camera, ImagePlus, X, Loader2, Timer } from "lucide-react";
import { toast } from "sonner";
import { normalizeItems, type ChecklistItem } from "@/lib/checklist-utils";
import { motion } from "framer-motion";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface FilePreview {
  file: File;
  url: string;
}

export default function FillChecklist() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [checked, setChecked] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [itemFiles, setItemFiles] = useState<Record<number, FilePreview[]>>({});
  const [startedAt] = useState(() => new Date());
  const [elapsed, setElapsed] = useState(0);

  // Live timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const { data: template, isLoading } = useQuery({
    queryKey: ["checklist-template", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_templates")
        .select("*")
        .eq("id", templateId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  const items: ChecklistItem[] = normalizeItems(template?.items);
  const photoRequiredItems = items.reduce<number[]>((acc, item, idx) => {
    if (item.requires_photo) acc.push(idx);
    return acc;
  }, []);

  const hasChanges = checked.length > 0 || notes.length > 0 || Object.keys(itemFiles).length > 0;
  const { showDialog, confirmLeave, cancelLeave, safeNavigate } = useUnsavedChanges(hasChanges);

  const allChecked = checked.length === items.length && items.length > 0;
  const missingPhotos = photoRequiredItems.filter(
    (idx) => checked.includes(items[idx].text) && (!itemFiles[idx] || itemFiles[idx].length === 0)
  );
  const canSubmit = allChecked && missingPhotos.length === 0;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!template || !user) return;

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

      const completedAt = new Date();
      const durationSeconds = Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000);

      const { error } = await supabase.from("checklist_submissions").insert({
        user_id: user.id,
        template_id: template.id,
        checked_items: checked,
        status: "pending",
        notes: notes || null,
        attachments,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_seconds: durationSeconds,
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
      navigate("/home");
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

  const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-xl" />
            <Skeleton className="h-5 w-40" />
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Checklist not found.</p>
          <Button variant="outline" className="rounded-xl" onClick={() => navigate("/home")}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 overflow-x-hidden">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={() => safeNavigate("/home")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <h1 className="text-base font-display font-bold truncate">{template.title}</h1>
              <span className="text-xs font-display font-bold text-muted-foreground tabular-nums shrink-0 flex items-center gap-1">
                <Timer className="h-3 w-3" />
                {formatElapsed(elapsed)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <Progress value={items.length > 0 ? (checked.length / items.length) * 100 : 0} className="h-1.5 flex-1" />
              <span className="text-xs font-display font-bold text-muted-foreground tabular-nums shrink-0">
                {checked.length}/{items.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {template.description && (
          <motion.p
            className="text-sm text-muted-foreground"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
          >
            {template.description}
          </motion.p>
        )}

        {/* Checklist items */}
        <div className="space-y-2">
          {items.map((item, i) => {
            const isChecked = checked.includes(item.text);
            const files = itemFiles[i] || [];
            const needsPhoto = item.requires_photo && isChecked;
            const photoMissing = item.requires_photo && isChecked && files.length === 0;
            return (
              <motion.div
                key={i}
                className="space-y-1.5"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.5, ease }}
              >
                <button
                  onClick={() => toggleItem(item.text)}
                  className={`w-full p-4 rounded-2xl  text-left font-display font-semibold transition-all flex items-center gap-3 active:scale-[0.98] ${
                    isChecked ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"
                  }`}
                >
                  <Checkbox checked={isChecked} className="pointer-events-none" />
                  <span className="flex-1 min-w-0 break-words">{item.text}</span>
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
              </motion.div>
            );
          })}
        </div>

        {/* Notes */}
        <Card className="rounded-2xl">
          <CardContent className="p-4 space-y-2">
            <Label className="text-sm font-display font-semibold">Audit Notes</Label>
            <Textarea
              placeholder="Add observations, comments, or context..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl text-sm min-h-[80px]"
            />
          </CardContent>
        </Card>
      </div>

      {/* Fixed bottom submit */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t z-10">
        <div className="max-w-lg mx-auto px-4 py-3">
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !canSubmit}
            className="w-full h-12 rounded-2xl text-base font-bold"
          >
            {submitMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting...</>
            ) : canSubmit ? (
              <><CheckSquare className="h-4 w-4 mr-2" /> Submit for Review</>
            ) : missingPhotos.length > 0 ? (
              `${missingPhotos.length} photo(s) required`
            ) : (
              `${items.length - checked.length} items remaining`
            )}
          </Button>
        </div>
      </div>

      <AlertDialog open={showDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved progress on this checklist. Are you sure you want to leave?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelLeave}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
