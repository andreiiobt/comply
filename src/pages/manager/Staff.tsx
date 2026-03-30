import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import {
  Users, User, CheckSquare, ArrowLeft, CheckCircle2, Clock, XCircle,
  Award, FileText, ShieldCheck, Calendar, ExternalLink, Pencil, Tag,
  History, ChevronRight,
} from "lucide-react";
import { format, isPast, isWithinInterval, addDays } from "date-fns";

type StaffMember = { user_id: string; full_name: string | null; avatar_url: string | null };

export default function ManagerStaff() {
  const { roles, profile } = useAuth();
  const queryClient = useQueryClient();
  const managerLocationId = roles.find((r) => r.role === "manager")?.location_id;
  const companyId = profile?.company_id;

  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [editRolesFor, setEditRolesFor] = useState<StaffMember | null>(null);
  const [editRoleIds, setEditRoleIds] = useState<string[]>([]);

  // ── Staff list ──────────────────────────────────────────────────────────────
  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ["manager-staff", managerLocationId],
    queryFn: async () => {
      if (!managerLocationId) return [];
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("location_id", managerLocationId)
        .eq("role", "staff");
      if (!roleData?.length) return [];
      const userIds = roleData.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);
      return (profiles || []) as StaffMember[];
    },
    enabled: !!managerLocationId,
  });

  // ── Custom roles for all staff (list view badges) ───────────────────────────
  const staffIds = staffList.map((s) => s.user_id);
  const { data: staffCustomRoles = [] } = useQuery({
    queryKey: ["manager-staff-custom-roles", staffIds],
    queryFn: async () => {
      if (!staffIds.length) return [];
      const { data } = await supabase
        .from("user_custom_roles")
        .select("user_id, custom_roles(id, name)")
        .in("user_id", staffIds);
      return (data || []) as any[];
    },
    enabled: staffIds.length > 0,
  });

  const staffRoleMap = useMemo(() => {
    const m: Record<string, { id: string; name: string }[]> = {};
    staffCustomRoles.forEach((r: any) => {
      if (!m[r.user_id]) m[r.user_id] = [];
      if (r.custom_roles) m[r.user_id].push(r.custom_roles);
    });
    return m;
  }, [staffCustomRoles]);

  // ── All company custom roles (for edit dialog) ──────────────────────────────
  const { data: allCustomRoles = [] } = useQuery({
    queryKey: ["custom-roles", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("custom_roles").select("id, name");
      return data || [];
    },
    enabled: !!companyId,
  });

  // ── Selected staff detail queries ───────────────────────────────────────────
  const { data: submissions = [] } = useQuery({
    queryKey: ["manager-staff-submissions", selectedStaff?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("checklist_submissions")
        .select("*")
        .eq("user_id", selectedStaff!.user_id)
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!selectedStaff,
  });

  const templateIds = useMemo(
    () => [...new Set(submissions.map((s: any) => s.template_id).filter(Boolean))],
    [submissions]
  );
  const { data: templateMap = {} } = useQuery({
    queryKey: ["manager-template-titles", templateIds],
    queryFn: async () => {
      if (!templateIds.length) return {};
      const { data } = await supabase
        .from("checklist_templates")
        .select("id, title")
        .in("id", templateIds as string[]);
      const map: Record<string, string> = {};
      (data || []).forEach((t: any) => { map[t.id] = t.title; });
      return map;
    },
    enabled: templateIds.length > 0,
  });

  const { data: licenses = [] } = useQuery({
    queryKey: ["manager-staff-licenses", selectedStaff?.user_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("user_licenses")
        .select("*")
        .eq("user_id", selectedStaff!.user_id)
        .order("expires_at", { ascending: true });
      return (data || []) as any[];
    },
    enabled: !!selectedStaff,
  });

  const { data: policiesWithAgreements = [] } = useQuery({
    queryKey: ["manager-staff-policies", selectedStaff?.user_id, companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: policies } = await (supabase as any)
        .from("policies")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_published", true);
      const { data: agreements } = await (supabase as any)
        .from("policy_agreements")
        .select("*")
        .eq("user_id", selectedStaff!.user_id);
      const agreementsList = (agreements || []) as any[];
      return ((policies || []) as any[]).map((p: any) => ({
        ...p,
        agreement: agreementsList.find((a: any) => a.policy_id === p.id),
      }));
    },
    enabled: !!selectedStaff && !!companyId,
  });

  // ── Edit custom roles ────────────────────────────────────────────────────────
  const editRolesMutation = useMutation({
    mutationFn: async ({ userId, roleIds }: { userId: string; roleIds: string[] }) => {
      await supabase.from("user_custom_roles").delete().eq("user_id", userId);
      if (roleIds.length > 0) {
        const rows = roleIds.map((roleId) => ({ user_id: userId, custom_role_id: roleId }));
        const { error } = await supabase.from("user_custom_roles").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manager-staff-custom-roles"] });
      toast({ title: "Custom roles updated" });
      setEditRolesFor(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openEditRoles(staff: StaffMember, e?: React.MouseEvent) {
    e?.stopPropagation();
    const current = (staffRoleMap[staff.user_id] || []).map((r: any) => r.id);
    setEditRoleIds(current);
    setEditRolesFor(staff);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getLicenseStatus = (expiryDate: string | null) => {
    if (!expiryDate) return { label: "Active", color: "text-primary bg-primary/10" };
    const date = new Date(expiryDate);
    if (isPast(date)) return { label: "Expired", color: "text-destructive bg-destructive/10" };
    if (isWithinInterval(date, { start: new Date(), end: addDays(new Date(), 30) }))
      return { label: "Expiring Soon", color: "text-orange-500 bg-orange-500/10" };
    return { label: "Active", color: "text-primary bg-primary/10" };
  };

  const getStatusBadge = (status: string) => {
    if (status === "approved")
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200/50 rounded-full px-2.5 py-0.5 text-xs font-bold gap-1">
          <CheckCircle2 className="h-3 w-3" /> Approved
        </Badge>
      );
    if (status === "pending")
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200/50 rounded-full px-2.5 py-0.5 text-xs font-bold gap-1">
          <Clock className="h-3 w-3" /> Pending
        </Badge>
      );
    if (status === "rejected")
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200/50 rounded-full px-2.5 py-0.5 text-xs font-bold gap-1">
          <XCircle className="h-3 w-3" /> Rejected
        </Badge>
      );
    return <Badge variant="outline" className="capitalize rounded-full">{status}</Badge>;
  };

  // ── Staff detail view ────────────────────────────────────────────────────────
  if (selectedStaff) {
    const staffRoles = staffRoleMap[selectedStaff.user_id] || [];
    const approvedCount = submissions.filter((s: any) => s.status === "approved").length;
    const activeLicenses = licenses.filter(
      (l: any) => !l.expires_at || !isPast(new Date(l.expires_at))
    ).length;
    const policySignOffs = policiesWithAgreements.filter((p: any) => p.agreement).length;

    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedStaff(null)}
            className="rounded-xl mt-0.5 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-display font-bold">{selectedStaff.full_name || "Unnamed"}</h1>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground h-7 text-xs"
                onClick={() => openEditRoles(selectedStaff)}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Roles
              </Button>
            </div>
            {staffRoles.length > 0 ? (
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {staffRoles.map((r: any) => (
                  <Badge
                    key={r.id}
                    variant="outline"
                    className="bg-violet-50 text-violet-700 border-violet-200/60 rounded-full text-xs px-2.5 gap-1"
                  >
                    <Tag className="h-3 w-3" /> {r.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">No custom roles assigned</p>
            )}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="rounded-xl border-none bg-muted/30">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">{submissions.length}</p>
              <p className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1 mt-1">
                <CheckSquare className="h-3.5 w-3.5" /> Checklists
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-none bg-muted/30">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold tabular-nums text-primary">{approvedCount}</p>
              <p className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1 mt-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approved
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-none bg-muted/30">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">{activeLicenses}</p>
              <p className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1 mt-1">
                <Award className="h-3.5 w-3.5" /> Active Licenses
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-none bg-muted/30">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold tabular-nums text-orange-500">{policySignOffs}</p>
              <p className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1 mt-1">
                <FileText className="h-3.5 w-3.5" /> Policy Sign-off
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="checklists" className="space-y-4">
          <TabsList className="rounded-xl">
            <TabsTrigger value="checklists" className="rounded-lg gap-1.5">
              <History className="h-3.5 w-3.5" /> Checklists
            </TabsTrigger>
            <TabsTrigger value="licenses" className="rounded-lg gap-1.5">
              <Award className="h-3.5 w-3.5" /> Licenses
            </TabsTrigger>
            <TabsTrigger value="compliance" className="rounded-lg gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Compliance
            </TabsTrigger>
          </TabsList>

          {/* Checklists */}
          <TabsContent value="checklists">
            <Card className="rounded-2xl">
              <CardHeader className="pb-3 px-5 pt-5">
                <CardTitle className="text-lg font-display font-bold flex items-center gap-2">
                  <CheckSquare className="h-5 w-5 text-green-600" /> Submissions
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-1">
                {submissions.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground italic text-sm">
                    No submissions yet
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {submissions.map((sub: any) => {
                      const tplTitle = sub.template_id ? (templateMap as any)[sub.template_id] : null;
                      return (
                        <div key={sub.id} className="flex items-center justify-between py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-sm">
                              {tplTitle || "General Checklist"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(sub.created_at), "MMM d, yyyy h:mm a")}
                            </span>
                            {sub.reviewer_note && (
                              <span className="text-xs text-muted-foreground italic truncate max-w-[260px]">
                                {sub.reviewer_note}
                              </span>
                            )}
                          </div>
                          {getStatusBadge(sub.status)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Licenses */}
          <TabsContent value="licenses">
            {licenses.length === 0 ? (
              <Card className="rounded-2xl border-dashed py-12 flex flex-col items-center text-muted-foreground bg-muted/20">
                <Award className="h-10 w-10 opacity-20 mb-3" />
                <p className="text-sm font-display">No uploaded licenses.</p>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {licenses.map((lic: any) => {
                  const status = getLicenseStatus(lic.expires_at);
                  return (
                    <Card
                      key={lic.id}
                      className="rounded-2xl p-4 relative overflow-hidden hover:shadow-md transition-all border-none bg-muted/40"
                    >
                      <div className="flex flex-col h-full space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="bg-primary/5 p-1.5 rounded-lg">
                            <Award className="h-4 w-4 text-primary" />
                          </div>
                          <Badge
                            className={`${status.color} border-none font-bold text-[9px] px-1.5 h-4 uppercase tracking-wider`}
                          >
                            {status.label}
                          </Badge>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold truncate mb-0.5">{lic.license_name}</h4>
                          {lic.license_number && (
                            <p className="text-xs text-muted-foreground mb-3 font-medium">
                              #{lic.license_number}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>
                              Expires:{" "}
                              {lic.expires_at
                                ? format(new Date(lic.expires_at), "MMM d, yyyy")
                                : "No expiry"}
                            </span>
                          </div>
                        </div>
                        {lic.document_url && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full rounded-lg gap-1.5 h-8 text-[10px] bg-background hover:bg-muted"
                            onClick={() => window.open(lic.document_url, "_blank")}
                          >
                            <ExternalLink className="h-3 w-3" /> View Document
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Compliance */}
          <TabsContent value="compliance">
            {policiesWithAgreements.length === 0 ? (
              <Card className="rounded-2xl border-dashed py-12 flex flex-col items-center text-muted-foreground bg-muted/20">
                <FileText className="h-10 w-10 opacity-20 mb-3" />
                <p className="text-sm font-display">No policies defined.</p>
              </Card>
            ) : (
              <Card className="rounded-2xl border-none bg-muted/30">
                <CardHeader className="pb-0 px-5 pt-5">
                  <CardTitle className="text-lg font-display font-bold flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" /> Policies & Agreements
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 py-2">
                  <div className="divide-y divide-border/30">
                    {policiesWithAgreements.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-xl transition-colors ${
                              p.agreement
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {p.agreement ? (
                              <ShieldCheck className="h-5 w-5" />
                            ) : (
                              <Clock className="h-5 w-5" />
                            )}
                          </div>
                          <h4 className="font-bold text-sm">{p.title}</h4>
                        </div>
                        {p.agreement ? (
                          <div className="text-right flex flex-col items-end">
                            <Badge
                              variant="outline"
                              className="bg-primary/5 text-primary border-primary/20 rounded-full px-2 py-0 h-5 text-[10px] font-bold uppercase tracking-wider"
                            >
                              Agreed
                            </Badge>
                            <p className="text-[11px] text-muted-foreground mt-1 font-medium">
                              {format(new Date(p.agreement.agreed_at), "MMM d, yyyy")}
                            </p>
                          </div>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-muted/50 text-muted-foreground border-none rounded-full px-2.5 h-6 text-xs font-medium"
                          >
                            Pending Sign-off
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // ── Staff list view ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold">Staff</h1>
        <p className="text-muted-foreground">View and manage staff at your location</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && staffList.length === 0 && (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No staff members at your location</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {staffList.map((staff) => {
          const staffRoles = staffRoleMap[staff.user_id] || [];
          return (
            <Card
              key={staff.user_id}
              className="rounded-2xl hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => setSelectedStaff(staff)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display font-bold text-sm">
                        {staff.full_name || "Unnamed"}
                      </p>
                      {staffRoles.length > 0 ? (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {staffRoles.map((r: any) => (
                            <Badge
                              key={r.id}
                              variant="outline"
                              className="bg-violet-50 text-violet-700 border-violet-200/60 rounded-full text-[10px] px-2 h-4 gap-0.5"
                            >
                              <Tag className="h-2.5 w-2.5" /> {r.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">No custom roles</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
                      onClick={(e) => openEditRoles(staff, e)}
                      title="Edit custom roles"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Edit Custom Roles Dialog */}
      <Dialog open={!!editRolesFor} onOpenChange={(o) => !o && setEditRolesFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Custom Roles</DialogTitle>
            <DialogDescription>
              Assign custom roles for{" "}
              <span className="font-medium text-foreground">
                {editRolesFor?.full_name || "this staff member"}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {allCustomRoles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No custom roles defined for your company.
              </p>
            ) : (
              allCustomRoles.map((role: any) => {
                const isSelected = editRoleIds.includes(role.id);
                return (
                  <label
                    key={role.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      isSelected
                        ? "border-violet-400 bg-violet-50 dark:bg-violet-950/20"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        setEditRoleIds((prev) =>
                          checked
                            ? [...prev, role.id]
                            : prev.filter((id) => id !== role.id)
                        );
                      }}
                    />
                    <span className="text-sm font-medium">{role.name}</span>
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRolesFor(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                editRolesMutation.mutate({
                  userId: editRolesFor!.user_id,
                  roleIds: editRoleIds,
                })
              }
              disabled={editRolesMutation.isPending}
            >
              {editRolesMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
