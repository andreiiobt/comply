import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  Plus, Pencil, X, ClipboardList, ChevronUp, ChevronDown, Tag, Camera,
  Check, ListChecks, Archive, RotateCcw, UserCheck, MapPin,
} from "lucide-react";
import { type ChecklistItem, normalizeItems } from "@/lib/checklist-utils";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ComplianceLibraryTab from "@/components/ComplianceLibraryTab";
import type { LibraryTemplate } from "@/lib/compliance-library";

type Template = {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  category: string | null;
  items: ChecklistItem[];
  is_published: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

type FormItem = { text: string; requires_photo: boolean };

const emptyForm = {
  title: "", description: "", category: "",
  items: [{ text: "", requires_photo: false }] as FormItem[],
  is_published: false,
  selectedCustomRoleIds: [] as string[],
};

const STEPS = [
  { label: "Details", icon: ClipboardList },
  { label: "Items", icon: ListChecks },
  { label: "Assignment", icon: UserCheck },
];

export default function ManagerChecklistTemplates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(0);
  const [showArchived, setShowArchived] = useState(false);

  const { data: managerLocationIds = [] } = useQuery({
    queryKey: ["manager-locations", profile?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("location_id")
        .eq("user_id", profile!.user_id)
        .eq("role", "manager");
      return (data || []).map((r: any) => r.location_id).filter(Boolean);
    },
    enabled: !!profile?.user_id,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["locations", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("id, name");
      return data || [];
    },
    enabled: !!companyId,
  });

  const managerLocationNames = useMemo(
    () => locations.filter((l) => managerLocationIds.includes(l.id)),
    [locations, managerLocationIds]
  );

  const { data: customRoles = [] } = useQuery({
    queryKey: ["custom-roles", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("custom_roles").select("id, name").order("name");
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: allAssignments = [] } = useQuery({
    queryKey: ["checklist-assignments-manager", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("checklist_assignments").select("*");
      return data || [];
    },
    enabled: !!companyId,
  });

  // Templates visible to this manager:
  // - assigned to their location(s) directly, OR
  // - assigned via custom_role (company-wide role assignments)
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["checklist-templates-manager", companyId, managerLocationIds, showArchived],
    queryFn: async () => {
      if (!companyId) return [] as Template[];

      const { data: locAssignments } = managerLocationIds.length > 0
        ? await supabase
            .from("checklist_assignments")
            .select("template_id")
            .eq("assign_type", "location")
            .in("assign_value", managerLocationIds)
        : { data: [] };

      const { data: roleAssignments } = await supabase
        .from("checklist_assignments")
        .select("template_id")
        .eq("assign_type", "custom_role");

      const assignedIds = [
        ...new Set([
          ...(locAssignments || []).map((a: any) => a.template_id),
          ...(roleAssignments || []).map((a: any) => a.template_id),
        ]),
      ];

      if (assignedIds.length === 0) return [] as Template[];

      const { data, error } = await supabase
        .from("checklist_templates")
        .select("*")
        .in("id", assignedIds)
        .eq("is_archived", showArchived)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        ...t,
        items: normalizeItems(t.items),
      })) as Template[];
    },
    enabled: !!companyId,
  });

  const templateCustomRoleMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    allAssignments.forEach((a: any) => {
      if (a.assign_type === "custom_role" && a.assign_value) {
        if (!m[a.template_id]) m[a.template_id] = [];
        if (!m[a.template_id].includes(a.assign_value)) m[a.template_id].push(a.assign_value);
      }
    });
    return m;
  }, [allAssignments]);

  const upsert = useMutation({
    mutationFn: async () => {
      const cleanItems = form.items
        .map((i) => ({ text: i.text.trim(), requires_photo: i.requires_photo }))
        .filter((i) => i.text);
      if (!form.title.trim()) throw new Error("Title is required");
      if (cleanItems.length === 0) throw new Error("Add at least one checklist item");
      if (form.selectedCustomRoleIds.length === 0)
        throw new Error("Select at least one custom role");

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        items: cleanItems,
        is_published: form.is_published,
        company_id: companyId!,
      };

      let templateId = editingId;

      if (editingId) {
        const { error } = await supabase.from("checklist_templates").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("checklist_templates").insert(payload).select("id").single();
        if (error) throw error;
        templateId = data.id;
      }

      // Record version
      if (templateId && profile?.user_id) {
        const { data: latestVersion } = await supabase
          .from("checklist_template_versions")
          .select("version_number")
          .eq("template_id", templateId)
          .order("version_number", { ascending: false })
          .limit(1)
          .single();
        const nextVersion = (latestVersion?.version_number ?? 0) + 1;
        await supabase.from("checklist_template_versions").insert({
          template_id: templateId,
          version_number: nextVersion,
          title: payload.title,
          description: payload.description,
          category: payload.category,
          items: cleanItems,
          changed_by: profile.user_id,
          change_summary: editingId ? `Updated to v${nextVersion}` : "Initial version",
        } as any);
      }

      if (templateId) {
        await supabase.from("checklist_assignments").delete().eq("template_id", templateId);

        // Only write custom_role assignments — writing location assignments too would
        // expose the checklist to ALL staff at those locations (OR logic in RLS),
        // bypassing the role filter entirely.
        const assignRows = form.selectedCustomRoleIds
          .map((roleId) => {
            const roleName = customRoles.find((r: any) => r.id === roleId)?.name;
            if (!roleName) return null;
            return {
              template_id: templateId!,
              company_id: companyId!,
              assign_type: "custom_role",
              assign_value: roleName,
            };
          })
          .filter(Boolean);

        if (assignRows.length > 0) {
          const { error } = await supabase.from("checklist_assignments").insert(assignRows);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist-templates-manager"] });
      queryClient.invalidateQueries({ queryKey: ["checklist-assignments-manager"] });
      queryClient.invalidateQueries({ queryKey: ["template-versions"] });
      toast({ title: editingId ? "Template updated" : "Template created" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const archiveMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklist_templates").update({ is_archived: true, is_published: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist-templates-manager"] });
      toast({ title: "Template archived" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const restoreMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklist_templates").update({ is_archived: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist-templates-manager"] });
      toast({ title: "Template restored" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setStep(0);
    setDialogOpen(true);
  }

  function useLibraryTemplate(t: LibraryTemplate) {
    setEditingId(null);
    setForm({
      ...emptyForm,
      title: t.title,
      description: t.description,
      category: t.category,
      items: t.items.map((i) => ({ text: i.text, requires_photo: i.requires_photo })),
    });
    setStep(0);
    setDialogOpen(true);
  }

  function openEdit(t: Template) {
    const tplAssignments = allAssignments.filter((a: any) => a.template_id === t.id);
    const customRoleNames = tplAssignments
      .filter((a: any) => a.assign_type === "custom_role" && a.assign_value)
      .map((a: any) => a.assign_value as string);
    const customRoleIds = customRoles
      .filter((r: any) => customRoleNames.includes(r.name))
      .map((r: any) => r.id);

    setEditingId(t.id);
    setForm({
      title: t.title,
      description: t.description ?? "",
      category: t.category ?? "",
      items: t.items.length > 0
        ? t.items.map((i) => ({ text: i.text, requires_photo: i.requires_photo }))
        : [{ text: "", requires_photo: false }],
      is_published: t.is_published,
      selectedCustomRoleIds: customRoleIds,
    });
    setStep(0);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setStep(0);
  }

  function updateItemText(idx: number, val: string) {
    setForm((f) => ({ ...f, items: f.items.map((v, i) => (i === idx ? { ...v, text: val } : v)) }));
  }
  function toggleItemPhoto(idx: number) {
    setForm((f) => ({ ...f, items: f.items.map((v, i) => (i === idx ? { ...v, requires_photo: !v.requires_photo } : v)) }));
  }
  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }
  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, { text: "", requires_photo: false }] }));
  }
  function moveItem(idx: number, dir: -1 | 1) {
    setForm((f) => {
      const items = [...f.items];
      const target = idx + dir;
      if (target < 0 || target >= items.length) return f;
      [items[idx], items[target]] = [items[target], items[idx]];
      return { ...f, items };
    });
  }

  function validateStep(s: number): string | null {
    if (s === 0 && !form.title.trim()) return "Title is required";
    if (s === 1 && form.items.filter((i) => i.text.trim()).length === 0) return "Add at least one item";
    if (s === 2 && form.selectedCustomRoleIds.length === 0) return "Select at least one custom role";
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  const filledItemCount = form.items.filter((i) => i.text.trim()).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Checklist Templates</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create checklists for your team
            {managerLocationNames.length > 0 ? ` at ${managerLocationNames.map((l) => l.name).join(", ")}` : ""}.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New Template
        </Button>
      </div>

      <Tabs defaultValue="my-templates">
        <TabsList>
          <TabsTrigger value="my-templates" onClick={() => setShowArchived(false)}>Active Templates</TabsTrigger>
          <TabsTrigger value="archived" onClick={() => setShowArchived(true)}>Archived</TabsTrigger>
          <TabsTrigger value="library">Template Library</TabsTrigger>
        </TabsList>

        <TabsContent value="my-templates" className="space-y-0 mt-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader><div className="h-5 bg-muted rounded w-2/3" /></CardHeader>
                </Card>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <Card className="-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <ClipboardList className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground font-medium">No templates yet</p>
                <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
                  <Plus className="h-4 w-4" /> New Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {templates.map((t) => {
                const photoCount = t.items.filter((i) => i.requires_photo).length;
                const tplCustomRoles = templateCustomRoleMap[t.id] || [];
                return (
                  <Card key={t.id} className="transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base leading-snug">{t.title}</CardTitle>
                        <Badge variant={t.is_published ? "default" : "secondary"} className="shrink-0 text-[10px]">
                          {t.is_published ? "Published" : "Draft"}
                        </Badge>
                      </div>
                      {t.description && <CardDescription className="line-clamp-2 text-xs">{t.description}</CardDescription>}
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">{t.items.length} items</span>
                        {photoCount > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Camera className="h-3 w-3" /> {photoCount}
                          </span>
                        )}
                        {t.category && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Tag className="h-2.5 w-2.5" /> {t.category}
                          </Badge>
                        )}
                      </div>
                      {tplCustomRoles.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {tplCustomRoles.map((roleName) => (
                            <Badge key={roleName} variant="outline" className="text-[10px] gap-1 border-violet-400 text-violet-600">
                              <UserCheck className="h-2.5 w-2.5" /> {roleName}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1 mt-3">
                        <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setDeleteId(t.id)}>
                          <Archive className="h-3.5 w-3.5" /> Archive
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="archived" className="space-y-0 mt-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader><div className="h-5 bg-muted rounded w-2/3" /></CardHeader>
                </Card>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <Card className="-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Archive className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground font-medium">No archived templates</p>
                <p className="text-muted-foreground/70 text-sm mt-1">Archived templates will appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {templates.map((t) => (
                <Card key={t.id} className="opacity-75 transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{t.title}</CardTitle>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">Archived</Badge>
                    </div>
                    {t.description && <CardDescription className="line-clamp-2 text-xs">{t.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <span className="text-xs text-muted-foreground">{t.items.length} items</span>
                    <div className="flex gap-1 mt-3">
                      <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => restoreMut.mutate(t.id)} disabled={restoreMut.isPending}>
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="library" className="mt-4">
          <ComplianceLibraryTab onUseTemplate={useLibraryTemplate} />
        </TabsContent>
      </Tabs>

      {/* Wizard Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>{editingId ? "Edit Template" : "New Template"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the checklist template." : "Create a checklist for your team."}
            </DialogDescription>
          </DialogHeader>

          {/* Step Indicator */}
          <div className="px-6 pt-4">
            <div className="flex items-center gap-1">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const isActive = step === i;
                const isComplete = step > i;
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => {
                      if (i < step) setStep(i);
                      else if (i === step + 1) goNext();
                    }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center",
                      isActive && "bg-primary text-primary-foreground",
                      isComplete && "bg-primary/10 text-primary",
                      !isActive && !isComplete && "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    <span className="hidden sm:inline">{s.label}</span>
                    {i === 1 && filledItemCount > 0 && (
                      <Badge variant={isActive ? "secondary" : "outline"} className="text-[10px] h-5 px-1.5 ml-0.5">
                        {filledItemCount}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">

            {/* Step 0: Details */}
            {step === 0 && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tpl-title" className="text-sm font-medium">Title</Label>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_published} onCheckedChange={(v) => setForm((f) => ({ ...f, is_published: v }))} id="tpl-published" />
                    <Label htmlFor="tpl-published" className="text-xs cursor-pointer text-muted-foreground">
                      {form.is_published ? "Published" : "Draft"}
                    </Label>
                  </div>
                </div>
                <Input
                  id="tpl-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Opening Checklist"
                  className="text-base h-11"
                />
                <div className="space-y-2">
                  <Label htmlFor="tpl-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea
                    id="tpl-desc"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tpl-category">Category <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="tpl-category"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. Kitchen, Safety"
                  />
                </div>
              </div>
            )}

            {/* Step 1: Items */}
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Add the items staff need to check off. Use the camera icon to require photo evidence.</p>
                <div className="space-y-2">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5 text-right tabular-nums shrink-0">{idx + 1}.</span>
                      <div className="flex flex-col shrink-0">
                        <Button type="button" size="icon" variant="ghost" className="h-5 w-5" disabled={idx === 0} onClick={() => moveItem(idx, -1)}>
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="h-5 w-5" disabled={idx === form.items.length - 1} onClick={() => moveItem(idx, 1)}>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <Input
                        value={item.text}
                        onChange={(e) => updateItemText(idx, e.target.value)}
                        placeholder={`Item ${idx + 1}`}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant={item.requires_photo ? "default" : "ghost"}
                        className={cn("h-8 w-8 shrink-0", !item.requires_photo && "text-muted-foreground hover:text-foreground")}
                        onClick={() => toggleItemPhoto(idx)}
                        title={item.requires_photo ? "Photo required — click to remove" : "Click to require photo evidence"}
                      >
                        <Camera className="h-3.5 w-3.5" />
                      </Button>
                      {form.items.length > 1 && (
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeItem(idx)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addItem}>
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </Button>
              </div>
            )}

            {/* Step 2: Assignment */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="rounded-lg bg-muted/50 border border-border/60 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
                  Select which custom roles should complete this checklist. Only staff with the selected role(s) will see it — regardless of location.
                </div>

                {/* Manager's locations — informational, auto-applied */}
                {managerLocationNames.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Your Location(s)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {managerLocationNames.map((loc) => (
                        <Badge key={loc.id} variant="outline" className="gap-1 text-xs">
                          <MapPin className="h-3 w-3" /> {loc.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Role selection — required */}
                <div>
                  <Label className="text-sm font-medium mb-1 block">
                    Custom Role <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Choose which roles must complete this checklist.
                  </p>

                  {customRoles.length === 0 ? (
                    <Card className="-dashed">
                      <CardContent className="flex flex-col items-center py-8 text-center">
                        <UserCheck className="h-8 w-8 text-muted-foreground/40 mb-2" />
                        <p className="text-sm text-muted-foreground">No custom roles found.</p>
                        <p className="text-xs text-muted-foreground mt-1">Ask an admin to create custom roles first.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {customRoles.map((role: any) => {
                        const isSelected = form.selectedCustomRoleIds.includes(role.id);
                        return (
                          <label
                            key={role.id}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                              isSelected ? "border-violet-400 bg-violet-50 dark:bg-violet-950/20" : "border-border hover:bg-muted/50"
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() =>
                                setForm((f) => ({
                                  ...f,
                                  selectedCustomRoleIds: isSelected
                                    ? f.selectedCustomRoleIds.filter((id) => id !== role.id)
                                    : [...f.selectedCustomRoleIds, role.id],
                                }))
                              }
                            />
                            <div className="flex items-center gap-2">
                              <UserCheck className={cn("h-4 w-4 shrink-0", isSelected ? "text-violet-600" : "text-muted-foreground")} />
                              <span className="text-sm font-medium">{role.name}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="px-6 py-4 border-t bg-muted/30 flex-row justify-between sm:justify-between">
            <div>
              {step > 0 && (
                <Button variant="ghost" onClick={goBack}>Back</Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={goNext}>Next</Button>
              ) : (
                <Button onClick={() => upsert.mutate()} disabled={upsert.isPending || customRoles.length === 0}>
                  {upsert.isPending ? "Saving…" : editingId ? "Save Changes" : "Create Template"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive template?</AlertDialogTitle>
            <AlertDialogDescription>Past submissions will be preserved. This template will no longer appear for staff.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && archiveMut.mutate(deleteId)}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
