import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckSquare, CheckCircle2, XCircle, Clock, User, ClipboardList, UserCheck, Search, Camera, ExternalLink, AlertTriangle, Timer, MapPin, Tag } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { normalizeItems, itemText } from "@/lib/checklist-utils";

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

export default function ChecklistReview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [filterMode, setFilterMode] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [checklistFilter, setChecklistFilter] = useState<string>("all");

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["checklist-submissions-review"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_submissions")
        .select("*")
        .neq("status", "draft")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const userIds = [...new Set(submissions.flatMap((s) => [s.user_id, s.completed_by].filter(Boolean)))];
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-review", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      return data || [];
    },
    enabled: userIds.length > 0,
  });

  const sourceIds = [...new Set(submissions.map((s) => s.lesson_id).filter(Boolean))];
  const { data: sources = [] } = useQuery({
    queryKey: ["sources-for-review", sourceIds],
    queryFn: async () => {
      if (sourceIds.length === 0) return [];
      const { data } = await supabase.from("lessons").select("id, title").in("id", sourceIds);
      return data || [];
    },
    enabled: sourceIds.length > 0,
  });

  const blockIds = [...new Set(submissions.map((s) => s.block_id).filter(Boolean))];
  const { data: blocks = [] } = useQuery({
    queryKey: ["blocks-for-review", blockIds],
    queryFn: async () => {
      if (blockIds.length === 0) return [];
      const { data } = await supabase.from("lesson_content").select("id, title, options").in("id", blockIds);
      return data || [];
    },
    enabled: blockIds.length > 0,
  });

  const templateIds = [...new Set(submissions.map((s) => s.template_id).filter(Boolean))];
  const { data: templates = [] } = useQuery({
    queryKey: ["templates-for-review", templateIds],
    queryFn: async () => {
      if (templateIds.length === 0) return [];
      const { data } = await supabase.from("checklist_templates").select("id, title, items").in("id", templateIds);
      return data || [];
    },
    enabled: templateIds.length > 0,
  });

  // Fetch user roles, locations, and custom roles for display
  const { data: userRoles = [] } = useQuery({
    queryKey: ["user-roles-for-review", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data } = await supabase.from("user_roles").select("user_id, location_id, role").in("user_id", userIds);
      return data || [];
    },
    enabled: userIds.length > 0,
  });

  const locationIds = [...new Set(userRoles.map((r: any) => r.location_id).filter(Boolean))];
  const { data: locations = [] } = useQuery({
    queryKey: ["locations-for-review", locationIds],
    queryFn: async () => {
      if (locationIds.length === 0) return [];
      const { data } = await supabase.from("locations").select("id, name").in("id", locationIds);
      return data || [];
    },
    enabled: locationIds.length > 0,
  });

  const { data: userCustomRoles = [] } = useQuery({
    queryKey: ["user-custom-roles-for-review", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data } = await supabase.from("user_custom_roles").select("user_id, custom_role_id").in("user_id", userIds);
      return data || [];
    },
    enabled: userIds.length > 0,
  });

  const customRoleIds = [...new Set(userCustomRoles.map((r: any) => r.custom_role_id).filter(Boolean))];
  const { data: customRoles = [] } = useQuery({
    queryKey: ["custom-roles-for-review", customRoleIds],
    queryFn: async () => {
      if (customRoleIds.length === 0) return [];
      const { data } = await supabase.from("custom_roles").select("id, name").in("id", customRoleIds);
      return data || [];
    },
    enabled: customRoleIds.length > 0,
  });

  const locationMap = useMemo(() => {
    const m: Record<string, string> = {};
    locations.forEach((l: any) => { m[l.id] = l.name; });
    return m;
  }, [locations]);

  const customRoleMap = useMemo(() => {
    const m: Record<string, string> = {};
    customRoles.forEach((r: any) => { m[r.id] = r.name; });
    return m;
  }, [customRoles]);

  const getUserLocation = (userId: string) => {
    const role = userRoles.find((r: any) => r.user_id === userId && r.location_id);
    return role ? locationMap[(role as any).location_id] : null;
  };

  const getUserCustomRoleNames = (userId: string) => {
    return userCustomRoles
      .filter((r: any) => r.user_id === userId)
      .map((r: any) => customRoleMap[r.custom_role_id])
      .filter(Boolean);
  };

  // Fetch assignment due dates for templates
  const { data: assignmentDueDates = [] } = useQuery({
    queryKey: ["assignment-due-dates", templateIds],
    queryFn: async () => {
      if (templateIds.length === 0) return [];
      const { data } = await supabase.from("checklist_assignments").select("template_id, due_date").in("template_id", templateIds);
      return data || [];
    },
    enabled: templateIds.length > 0,
  });

  // Map template_id -> earliest due_date
  const dueDateMap = useMemo(() => {
    const map: Record<string, string> = {};
    assignmentDueDates.forEach((a: any) => {
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
      queryClient.invalidateQueries({ queryKey: ["checklist-submissions-review"] });
      toast.success(`Submission ${status}`);
    },
  });

  const getName = (userId: string | null) => {
    if (!userId) return null;
    return profiles.find((p) => p.user_id === userId)?.full_name || "Unknown";
  };
  const getSourceTitle = (id: string | null) => {
    if (!id) return "Standalone Checklist";
    return sources.find((l) => l.id === id)?.title || "Unknown Source";
  };
  const getBlock = (id: string | null) => id ? blocks.find((b) => b.id === id) : null;
  const getTemplate = (id: string | null) => id ? templates.find((t) => t.id === id) : null;

  /** Get items for a submission — from block options or template items */
  const getItemsForSubmission = (sub: typeof submissions[0]) => {
    const block = getBlock(sub.block_id);
    if (block?.options) return normalizeItems(block.options);
    const template = getTemplate(sub.template_id);
    if (template?.items) return normalizeItems(template.items);
    return [];
  };

  /** Get title for a submission */
  const getSubmissionTitle = (sub: typeof submissions[0]) => {
    const block = getBlock(sub.block_id);
    if (block?.title) return block.title;
    const template = getTemplate(sub.template_id);
    if (template?.title) return template.title;
    return (sub as any).template_title || "Checklist";
  };

  // Unique checklist names for filter
  const checklistNames = useMemo(() => {
    const names = new Set<string>();
    submissions.forEach((s) => { names.add(getSubmissionTitle(s)); });
    return Array.from(names).sort();
  }, [submissions, blocks, templates]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return submissions.filter((s) => {
      if (filterMode === "self" && s.completed_by && s.completed_by !== s.user_id) return false;
      if (filterMode === "trainer" && (!s.completed_by || s.completed_by === s.user_id)) return false;
      if (statusFilter === "pending" && s.status !== "pending") return false;
      if (statusFilter === "approved" && s.status !== "approved") return false;
      if (statusFilter === "rejected" && s.status !== "rejected") return false;
      if (sourceFilter !== "all" && s.lesson_id !== sourceFilter) return false;
      if (checklistFilter !== "all" && getSubmissionTitle(s) !== checklistFilter) return false;
      if (q) {
        const userName = getName(s.user_id)?.toLowerCase() || "";
        const srcTitle = getSourceTitle(s.lesson_id).toLowerCase();
        const subTitle = getSubmissionTitle(s).toLowerCase();
        if (!userName.includes(q) && !srcTitle.includes(q) && !subTitle.includes(q)) return false;
      }
      return true;
    });
  }, [submissions, filterMode, statusFilter, searchQuery, sourceFilter, checklistFilter, profiles, sources, blocks, templates]);

  const pendingSubmissions = filtered.filter((s) => s.status === "pending");
  const reviewedSubmissions = filtered.filter((s) => s.status !== "pending");

  const renderItems = (sub: typeof submissions[0]) => {
    const items = getItemsForSubmission(sub);
    const checkedItems = Array.isArray(sub.checked_items) ? (sub.checked_items as string[]) : [];
    const attachmentsMap = getAttachmentsMap(sub.attachments);

    return (
      <div className="space-y-1.5">
        {items.map((item, i) => {
          const isChecked = checkedItems.includes(item.text);
          const photos = attachmentsMap[String(i)] || [];
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                {isChecked ? (
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                )}
                <span className={isChecked ? "" : "text-muted-foreground"}>{item.text}</span>
                {item.requires_photo && (
                  <Camera className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                )}
                {photos.length > 0 && (
                  <Badge variant="secondary" className="rounded-lg text-[10px] px-1.5 py-0 h-4 gap-0.5">
                    <Camera className="h-2.5 w-2.5" />
                    {photos.length}
                  </Badge>
                )}
              </div>
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-1.5 ml-6">
                  {photos.map((photo, pi) => (
                    <a
                      key={pi}
                      href={getPublicUrl(photo.path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative w-16 h-16 rounded-xl overflow-hidden border hover:ring-2 hover:ring-primary/50 transition-shadow group"
                    >
                      <img
                        src={getPublicUrl(photo.path)}
                        alt={photo.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ExternalLink className="h-3.5 w-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderItemBadges = (sub: typeof submissions[0]) => {
    const items = getItemsForSubmission(sub);
    const checkedItems = Array.isArray(sub.checked_items) ? (sub.checked_items as string[]) : [];
    const attachmentsMap = getAttachmentsMap(sub.attachments);

    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {items.map((item, i) => {
          const photos = attachmentsMap[String(i)] || [];
          return (
            <Badge key={i} variant={checkedItems.includes(item.text) ? "default" : "outline"} className="rounded-lg text-xs gap-1">
              {item.text}
              {photos.length > 0 && <Camera className="h-2.5 w-2.5" />}
            </Badge>
          );
        })}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold">Checklist Submissions</h1>
          <p className="text-muted-foreground text-sm mt-1">Review and approve staff checklist submissions</p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or checklist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] rounded-xl">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterMode} onValueChange={setFilterMode}>
          <SelectTrigger className="w-[160px] rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All submissions</SelectItem>
            <SelectItem value="self">Self-paced</SelectItem>
            <SelectItem value="trainer">Trainer-driven</SelectItem>
          </SelectContent>
        </Select>
        {sources.length > 0 && (
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[180px] rounded-xl">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sources.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {checklistNames.length > 1 && (
          <Select value={checklistFilter} onValueChange={setChecklistFilter}>
            <SelectTrigger className="w-[200px] rounded-xl">
              <SelectValue placeholder="All checklists" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All checklists</SelectItem>
              {checklistNames.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Pending */}
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
          const isTrainerDriven = sub.completed_by && sub.completed_by !== sub.user_id;

          return (
            <Card key={sub.id} className="rounded-2xl  cursor-pointer  transition-shadow" onClick={() => navigate(`/admin/checklists/${sub.id}`)}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-display font-bold text-sm">{getName(sub.user_id)}</span>
                      {isTrainerDriven && (
                        <Badge variant="outline" className="rounded-lg text-xs gap-1">
                          <UserCheck className="h-3 w-3" />
                          Completed by {getName(sub.completed_by)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ClipboardList className="h-3.5 w-3.5" />
                      <span>{getSourceTitle(sub.lesson_id)}</span>
                      <span>·</span>
                      <span>{getSubmissionTitle(sub)}</span>
                    </div>
                  </div>
                  <Badge variant="secondary" className="rounded-lg">
                    <Clock className="h-4 w-4 mr-1" />Pending
                  </Badge>
                  {sub.template_id && dueDateMap[sub.template_id] && new Date(dueDateMap[sub.template_id]) < new Date() && (
                    <Badge variant="destructive" className="rounded-lg gap-1 text-xs">
                      <AlertTriangle className="h-3 w-3" />
                      Overdue · {format(new Date(dueDateMap[sub.template_id]), "MMM d")}
                    </Badge>
                  )}
                </div>

                {renderItems(sub)}

                {sub.notes && (
                  <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">
                    Staff notes: {sub.notes}
                  </p>
                )}

                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>Submitted: {new Date(sub.created_at).toLocaleDateString()}</span>
                  {(sub as any).duration_seconds != null && (
                    <span className="flex items-center gap-1">
                      <Timer className="h-3 w-3" />
                      {Math.round((sub as any).duration_seconds / 60)} min
                    </span>
                  )}
                </div>

                <Textarea
                  placeholder="Optional note..."
                  value={reviewNote[sub.id] || ""}
                  onChange={(e) => setReviewNote((prev) => ({ ...prev, [sub.id]: e.target.value }))}
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
        })}
      </div>

      {/* Reviewed */}
      {reviewedSubmissions.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display font-bold text-lg">Previously Reviewed</h2>
          {reviewedSubmissions.map((sub) => {
            const isTrainerDriven = sub.completed_by && sub.completed_by !== sub.user_id;

            return (
              <Card key={sub.id} className="rounded-2xl cursor-pointer  transition-shadow" onClick={() => navigate(`/admin/checklists/${sub.id}`)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-display font-semibold text-sm">{getName(sub.user_id)}</span>
                        {isTrainerDriven && (
                          <Badge variant="outline" className="rounded-lg text-xs gap-1">
                            <UserCheck className="h-3 w-3" />
                            {getName(sub.completed_by)}
                          </Badge>
                        )}
                        {getUserCustomRoleNames(sub.user_id).map((role) => (
                          <Badge key={role} variant="secondary" className="rounded-lg text-[10px] gap-0.5">
                            <Tag className="h-2.5 w-2.5" /> {role}
                          </Badge>
                        ))}
                        {getUserLocation(sub.user_id) && (
                          <Badge variant="outline" className="rounded-lg text-[10px] gap-0.5">
                            <MapPin className="h-2.5 w-2.5" /> {getUserLocation(sub.user_id)}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ClipboardList className="h-3.5 w-3.5" />
                        <span>{getSourceTitle(sub.lesson_id)} · {getSubmissionTitle(sub)}</span>
                        <span>·</span>
                        <span>{format(new Date(sub.created_at), "MMM d, yyyy")}</span>
                      </div>
                    </div>
                    <Badge
                      variant={sub.status === "approved" ? "default" : "destructive"}
                      className="rounded-lg gap-1"
                    >
                      {sub.status === "approved" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      {sub.status}
                    </Badge>
                  </div>
                  {sub.reviewer_note && (
                    <p className="text-xs text-muted-foreground mt-2 italic">Note: {sub.reviewer_note}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
