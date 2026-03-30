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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, X, ClipboardList, ChevronUp, ChevronDown, Tag, Camera, CalendarIcon, Check, ListChecks, MapPin, Archive, RotateCcw, History, UserCheck } from "lucide-react";
import VersionHistoryDialog from "@/components/VersionHistoryDialog";
import { type ChecklistItem, normalizeItems } from "@/lib/checklist-utils";
import { Checkbox } from "@/components/ui/checkbox";
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

type Schedule = {
  due_date: string | null;
  recurrence_type: string;
  recurrence_days: number[];
  recurrence_time: string;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const emptySchedule: Schedule = { due_date: null, recurrence_type: "none", recurrence_days: [], recurrence_time: "09:00" };

const emptyForm = {
  title: "", description: "", category: "",
  items: [{ text: "", requires_photo: false }] as FormItem[],
  is_published: false,
  selectedLocationIds: [] as string[],
  selectedTagIds: [] as string[],
  selectedCustomRoleIds: [] as string[],
  schedule: { ...emptySchedule },
};

const STEPS = [
  { label: "Details", icon: ClipboardList },
  { label: "Items", icon: ListChecks },
  { label: "Assignment", icon: MapPin },
];

export default function ChecklistTemplates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(0);

  const [historyTemplateId, setHistoryTemplateId] = useState<string | null>(null);
  const [historyTemplateTitle, setHistoryTemplateTitle] = useState("");

  const [showArchived, setShowArchived] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["checklist-templates", companyId, showArchived],
    queryFn: async () => {
      let query = supabase
        .from("checklist_templates")
        .select("*")
        .eq("is_archived", showArchived)
        .order("created_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        ...t,
        items: normalizeItems(t.items),
      })) as Template[];
    },
    enabled: !!companyId,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["locations", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("id, name");
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: locationTags = [] } = useQuery({
    queryKey: ["location-tags", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("location_tags").select("*").order("name");
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: tagAssignments = [] } = useQuery({
    queryKey: ["location-tag-assignments", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("location_tag_assignments").select("*");
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: customRoles = [] } = useQuery({
    queryKey: ["custom-roles", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("custom_roles").select("id, name");
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: allAssignments = [] } = useQuery({
    queryKey: ["checklist-assignments", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("checklist_assignments").select("*");
      return data || [];
    },
    enabled: !!companyId,
  });

  // Map: tagId -> locationIds
  const tagToLocations = useMemo(() => {
    const m: Record<string, string[]> = {};
    tagAssignments.forEach((ta: any) => {
      if (!m[ta.tag_id]) m[ta.tag_id] = [];
      m[ta.tag_id].push(ta.location_id);
    });
    return m;
  }, [tagAssignments]);

  const upsert = useMutation({
    mutationFn: async () => {
      const cleanItems = form.items
        .map((i) => ({ text: i.text.trim(), requires_photo: i.requires_photo }))
        .filter((i) => i.text);
      if (!form.title.trim()) throw new Error("Title is required");
      if (cleanItems.length === 0) throw new Error("Add at least one checklist item");
      if (form.selectedLocationIds.length === 0 && form.selectedTagIds.length === 0 && form.selectedCustomRoleIds.length === 0)
        throw new Error("Select at least one location, tag, or custom role");

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
        const assignRows: any[] = [];

        // Location assignments
        form.selectedLocationIds.forEach((locId) => {
          assignRows.push({
            template_id: templateId!,
            company_id: companyId!,
            assign_type: "location",
            assign_value: locId,
            due_date: form.schedule.due_date || null,
            recurrence_type: form.schedule.recurrence_type || "none",
            recurrence_days: form.schedule.recurrence_days.length > 0 ? form.schedule.recurrence_days : null,
            recurrence_time: form.schedule.recurrence_time || "09:00",
          });
        });

        // Tag assignments
        form.selectedTagIds.forEach((tagId) => {
          assignRows.push({
            template_id: templateId!,
            company_id: companyId!,
            assign_type: "location_tag",
            assign_value: tagId,
            due_date: form.schedule.due_date || null,
            recurrence_type: form.schedule.recurrence_type || "none",
            recurrence_days: form.schedule.recurrence_days.length > 0 ? form.schedule.recurrence_days : null,
            recurrence_time: form.schedule.recurrence_time || "09:00",
          });
        });

        // Custom role assignments
        form.selectedCustomRoleIds.forEach((roleId) => {
          const roleName = customRoles.find((r: any) => r.id === roleId)?.name;
          if (roleName) {
            assignRows.push({
              template_id: templateId!,
              company_id: companyId!,
              assign_type: "custom_role",
              assign_value: roleName,
              due_date: form.schedule.due_date || null,
              recurrence_type: form.schedule.recurrence_type || "none",
              recurrence_days: form.schedule.recurrence_days.length > 0 ? form.schedule.recurrence_days : null,
              recurrence_time: form.schedule.recurrence_time || "09:00",
            });
          }
        });

        if (assignRows.length > 0) {
          const { error } = await supabase.from("checklist_assignments").insert(assignRows);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
      queryClient.invalidateQueries({ queryKey: ["checklist-assignments"] });
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
      queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
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
      queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
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
    const locationIds = tplAssignments
      .filter((a: any) => a.assign_type === "location" && a.assign_value)
      .map((a: any) => a.assign_value as string);
    const tagIds = tplAssignments
      .filter((a: any) => a.assign_type === "location_tag" && a.assign_value)
      .map((a: any) => a.assign_value as string);
    const customRoleNames = tplAssignments
      .filter((a: any) => a.assign_type === "custom_role" && a.assign_value)
      .map((a: any) => a.assign_value as string);
    const customRoleIds = customRoles
      .filter((r: any) => customRoleNames.includes(r.name))
      .map((r: any) => r.id);
    const firstAssign = tplAssignments[0] as any;

    setEditingId(t.id);
    setForm({
      title: t.title,
      description: t.description ?? "",
      category: t.category ?? "",
      items: t.items.length > 0 ? t.items.map((i) => ({ text: i.text, requires_photo: i.requires_photo })) : [{ text: "", requires_photo: false }],
      is_published: t.is_published,
      selectedLocationIds: locationIds,
      selectedTagIds: tagIds,
      selectedCustomRoleIds: customRoleIds,
      schedule: {
        due_date: firstAssign?.due_date || null,
        recurrence_type: firstAssign?.recurrence_type || "none",
        recurrence_days: firstAssign?.recurrence_days || [],
        recurrence_time: firstAssign?.recurrence_time || "09:00",
      },
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

  function toggleLocation(locId: string) {
    setForm((f) => ({
      ...f,
      selectedLocationIds: f.selectedLocationIds.includes(locId)
        ? f.selectedLocationIds.filter((id) => id !== locId)
        : [...f.selectedLocationIds, locId],
    }));
  }

  function toggleTag(tagId: string) {
    setForm((f) => {
      const wasSelected = f.selectedTagIds.includes(tagId);
      const newTagIds = wasSelected
        ? f.selectedTagIds.filter((id) => id !== tagId)
        : [...f.selectedTagIds, tagId];

      // When selecting a tag, auto-select its locations; when deselecting, remove them
      const tagLocIds = tagToLocations[tagId] || [];
      let newLocIds = [...f.selectedLocationIds];
      if (!wasSelected) {
        tagLocIds.forEach((lid) => { if (!newLocIds.includes(lid)) newLocIds.push(lid); });
      } else {
        // Remove locations that belong only to this tag (not to other selected tags)
        const otherTagLocs = new Set<string>();
        newTagIds.forEach((tid) => (tagToLocations[tid] || []).forEach((lid) => otherTagLocs.add(lid)));
        newLocIds = newLocIds.filter((lid) => otherTagLocs.has(lid) || !tagLocIds.includes(lid));
      }

      return { ...f, selectedTagIds: newTagIds, selectedLocationIds: newLocIds };
    });
  }

  const [filterCategory, setFilterCategory] = useState("all");
  const [filterLocationId, setFilterLocationId] = useState("all");

  const locationMap = useMemo(() => {
    const m: Record<string, string> = {};
    locations.forEach((l) => { m[l.id] = l.name; });
    return m;
  }, [locations]);

  const tagMap = useMemo(() => {
    const m: Record<string, any> = {};
    locationTags.forEach((t: any) => { m[t.id] = t; });
    return m;
  }, [locationTags]);

  const templateLocationMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    allAssignments.forEach((a: any) => {
      if (a.assign_type === "location" && a.assign_value) {
        if (!m[a.template_id]) m[a.template_id] = [];
        if (!m[a.template_id].includes(a.assign_value)) m[a.template_id].push(a.assign_value);
      }
    });
    return m;
  }, [allAssignments]);

  const templateTagMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    allAssignments.forEach((a: any) => {
      if (a.assign_type === "location_tag" && a.assign_value) {
        if (!m[a.template_id]) m[a.template_id] = [];
        if (!m[a.template_id].includes(a.assign_value)) m[a.template_id].push(a.assign_value);
      }
    });
    return m;
  }, [allAssignments]);

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

  const categories = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => { if (t.category) set.add(t.category); });
    return Array.from(set).sort();
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (filterCategory !== "all" && t.category !== filterCategory) return false;
      if (filterLocationId !== "all") {
        const locs = templateLocationMap[t.id] || [];
        if (!locs.includes(filterLocationId)) return false;
      }
      return true;
    });
  }, [templates, filterCategory, filterLocationId, templateLocationMap]);

  function validateStep(s: number): string | null {
    if (s === 0 && !form.title.trim()) return "Title is required";
    if (s === 1 && form.items.filter((i) => i.text.trim()).length === 0) return "Add at least one item";
    if (s === 2 && form.selectedLocationIds.length === 0 && form.selectedTagIds.length === 0 && form.selectedCustomRoleIds.length === 0) return "Select at least one location, tag, or custom role";
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
          <p className="text-muted-foreground text-sm mt-1">Create and manage reusable checklist templates for audits.</p>
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

        <TabsContent value="my-templates" className="space-y-4 mt-4">
      {/* Filter Bar */}
      {!isLoading && templates.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterLocationId} onValueChange={setFilterLocationId}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(filterCategory !== "all" || filterLocationId !== "all") && (
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setFilterCategory("all"); setFilterLocationId("all"); }}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader><div className="h-5 bg-muted rounded w-2/3" /><div className="h-3 bg-muted rounded w-1/2 mt-2" /></CardHeader>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground font-medium">No templates yet</p>
            <p className="text-muted-foreground/70 text-sm mt-1">Create your first checklist template to get started.</p>
            <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
              <Plus className="h-4 w-4" /> New Template
            </Button>
          </CardContent>
        </Card>
      ) : filteredTemplates.length === 0 ? (
        <Card className="-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground font-medium">No templates match filters</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => { setFilterCategory("all"); setFilterLocationId("all"); }}>
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((t) => {
            const photoCount = t.items.filter((i) => i.requires_photo).length;
            const tplLocations = templateLocationMap[t.id] || [];
            const tplTags = templateTagMap[t.id] || [];
            const tplCustomRoles = templateCustomRoleMap[t.id] || [];
            return (
              <Card key={t.id} className="group relative transition-shadow ">
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
                    <span className="text-xs text-muted-foreground">{t.items.length} item{t.items.length !== 1 ? "s" : ""}</span>
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
                  {(tplLocations.length > 0 || tplTags.length > 0 || tplCustomRoles.length > 0) && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {tplTags.map((tagId) => {
                        const tag = tagMap[tagId];
                        return tag ? (
                          <Badge
                            key={tagId}
                            variant="outline"
                            className="text-[10px] gap-0.5"
                            style={{ borderColor: tag.color || undefined, color: tag.color || undefined }}
                          >
                            <Tag className="h-2.5 w-2.5" /> {tag.name}
                          </Badge>
                        ) : null;
                      })}
                      {tplLocations.map((locId) => (
                        <Badge key={locId} variant="outline" className="text-[10px] gap-1">
                          <MapPin className="h-2.5 w-2.5" /> {locationMap[locId] || locId}
                        </Badge>
                      ))}
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
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => { setHistoryTemplateId(t.id); setHistoryTemplateTitle(t.title); }}>
                      <History className="h-3.5 w-3.5" /> History
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

        <TabsContent value="archived" className="space-y-4 mt-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                <p className="text-muted-foreground/70 text-sm mt-1">Archived templates will appear here. Past submissions are preserved.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <Card key={t.id} className="opacity-75 transition-shadow ">
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
              {editingId ? "Update the checklist template." : "Create a reusable checklist for compliance audits."}
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
                    {isComplete ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
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
                <Input id="tpl-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Kitchen Opening Checklist" className="text-base h-11" />

                <div className="space-y-2">
                  <Label htmlFor="tpl-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea id="tpl-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Brief description of this checklist" rows={3} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tpl-category">Category <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input id="tpl-category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Kitchen, Safety, Opening" />
                </div>
              </div>
            )}

            {/* Step 1: Items */}
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Add the items staff need to check off. Use the camera icon to require photo evidence.</p>
                <div className="space-y-2">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 group/item">
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

            {/* Step 2: Locations & Tags & Schedule */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="rounded-lg bg-muted/50 border border-border/60 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
                  Select locations, tags, or custom roles — or any combination. Each selection is independent: a staff member sees this checklist if they match <span className="font-medium text-foreground">any</span> of the selected criteria. To target only a specific role, select that role without choosing any locations.
                </div>

                {/* Assign by Tag */}
                {locationTags.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Assign by Tag</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Selecting a tag will assign this checklist to all locations with that tag.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {locationTags.map((tag: any) => {
                        const isSelected = form.selectedTagIds.includes(tag.id);
                        const tagLocCount = (tagToLocations[tag.id] || []).length;
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => toggleTag(tag.id)}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                              isSelected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-muted/50"
                            )}
                            style={isSelected ? { borderColor: tag.color || undefined, color: tag.color || undefined, backgroundColor: `${tag.color}15` } : { borderColor: tag.color || undefined, color: tag.color || undefined }}
                          >
                            <Tag className="h-3 w-3" />
                            {tag.name}
                            <span className="text-[10px] opacity-70">({tagLocCount})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Individual Locations */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Assign by Location</Label>
                  <p className="text-xs text-muted-foreground mb-3">Select individual locations, or use tags above to select groups.</p>
                  <div className="flex items-center gap-2 mb-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setForm((f) => ({ ...f, selectedLocationIds: locations.map((l) => l.id) }))}
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setForm((f) => ({ ...f, selectedLocationIds: [], selectedTagIds: [] }))}
                    >
                      Deselect All
                    </Button>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {form.selectedLocationIds.length} of {locations.length} selected
                    </span>
                  </div>
                  {locations.length === 0 ? (
                    <Card className="-dashed">
                      <CardContent className="flex flex-col items-center py-8 text-center">
                        <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
                        <p className="text-sm text-muted-foreground">No locations found. Add locations first.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {locations.map((loc) => {
                        const isSelected = form.selectedLocationIds.includes(loc.id);
                        return (
                          <label
                            key={loc.id}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                              isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleLocation(loc.id)}
                            />
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium">{loc.name}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Assign by Custom Role */}
                {customRoles.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Assign by Custom Role</Label>
                    <p className="text-xs text-muted-foreground mb-3">
                      Assigns this checklist to all users who hold the selected custom role, regardless of location. Use this without selecting locations above to restrict to that role only.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {customRoles.map((role: any) => {
                        const isSelected = form.selectedCustomRoleIds.includes(role.id);
                        return (
                          <label
                            key={role.id}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                              isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
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
                              <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium">{role.name}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Schedule */}
                <Card className="p-4 space-y-3">
                  <Label className="text-sm font-medium">Schedule</Label>

                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "h-9 w-[160px] justify-start text-left text-xs font-normal",
                            !form.schedule.due_date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {form.schedule.due_date ? format(new Date(form.schedule.due_date), "MMM d, yyyy") : "Due date (optional)"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={form.schedule.due_date ? new Date(form.schedule.due_date) : undefined}
                          onSelect={(date) => {
                            setForm((f) => ({
                              ...f,
                              schedule: { ...f.schedule, due_date: date ? date.toISOString() : null },
                            }));
                          }}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    {form.schedule.due_date && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setForm((f) => ({ ...f, schedule: { ...f.schedule, due_date: null } }))}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">Repeat:</span>
                    <Select value={form.schedule.recurrence_type} onValueChange={(v) => {
                      setForm((f) => ({
                        ...f,
                        schedule: { ...f.schedule, recurrence_type: v, recurrence_days: [] },
                      }));
                    }}>
                      <SelectTrigger className="w-[110px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">One-time</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>

                    {form.schedule.recurrence_type === "weekly" && (
                      <div className="flex gap-1">
                        {DAY_LABELS.map((day, dayIdx) => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              setForm((f) => {
                                const days = f.schedule.recurrence_days.includes(dayIdx)
                                  ? f.schedule.recurrence_days.filter((d) => d !== dayIdx)
                                  : [...f.schedule.recurrence_days, dayIdx];
                                return { ...f, schedule: { ...f.schedule, recurrence_days: days } };
                              });
                            }}
                            className={cn(
                              "h-7 w-7 rounded text-[10px] font-medium transition-colors",
                              form.schedule.recurrence_days.includes(dayIdx)
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    )}

                    {form.schedule.recurrence_type === "monthly" && (
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        placeholder="Day"
                        className="w-[80px] h-8 text-xs"
                        value={form.schedule.recurrence_days[0] || ""}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setForm((f) => ({
                            ...f,
                            schedule: { ...f.schedule, recurrence_days: val >= 1 && val <= 31 ? [val] : [] },
                          }));
                        }}
                      />
                    )}

                    {form.schedule.recurrence_type !== "none" && (
                      <Input
                        type="time"
                        className="w-[100px] h-8 text-xs"
                        value={form.schedule.recurrence_time}
                        onChange={(e) => {
                          setForm((f) => ({
                            ...f,
                            schedule: { ...f.schedule, recurrence_time: e.target.value },
                          }));
                        }}
                      />
                    )}
                  </div>
                </Card>
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
                <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
                  {upsert.isPending ? "Saving…" : editingId ? "Save Changes" : "Create Template"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation */}
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

      <VersionHistoryDialog
        open={!!historyTemplateId}
        onOpenChange={(open) => { if (!open) setHistoryTemplateId(null); }}
        templateId={historyTemplateId}
        templateTitle={historyTemplateTitle}
      />
    </div>
  );
}
