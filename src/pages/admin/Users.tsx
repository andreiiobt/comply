import { useState } from "react";
import UserDetailView from "@/components/admin/UserDetailView";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users as UsersIcon, Shield, UserCog, User, UserPlus, Copy, Link2, Mail, Trash2, Clock, Tag, ArrowLeft, ArrowRight, Pencil, X, Check, MapPin, Search, Filter, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";

const roleIcons: Record<string, any> = {
  admin: Shield,
  manager: UserCog,
  supervisor: Eye,
  staff: User,
};

const roleColors: Record<string, string> = {
  admin: "bg-primary/10 text-primary",
  manager: "bg-secondary/10 text-secondary",
  supervisor: "bg-accent/10 text-accent-foreground",
  staff: "bg-muted text-muted-foreground",
};

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function AdminUsers() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState(1);
  const [selectedUser, setSelectedUser] = useState<{ user_id: string; full_name: string | null } | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("staff");
  const [inviteLocationId, setInviteLocationId] = useState<string>("");
  const [inviteCustomRoleIds, setInviteCustomRoleIds] = useState<string[]>([]);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  // Edit user state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<string>("staff");
  const [editLocationId, setEditLocationId] = useState<string>("");
  const [editCustomRoleIds, setEditCustomRoleIds] = useState<string[]>([]);

  // Delete user state
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<{ user_id: string; full_name: string | null } | null>(null);

  // Filter state
  const [filterName, setFilterName] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterLocationId, setFilterLocationId] = useState<string>("all");
  const [filterCustomRoleId, setFilterCustomRoleId] = useState<string>("all");

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin-profiles", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, user_roles(id, role, location_id)")
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });

  const { data: allUserCustomRoles = [] } = useQuery({
    queryKey: ["admin-user-custom-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_custom_roles")
        .select("user_id, custom_role_id, custom_roles(name)");
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["admin-locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });

  const { data: invitations = [] } = useQuery({
    queryKey: ["admin-invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("*")
        .eq("company_id", profile!.company_id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });

  const { data: customRoles = [] } = useQuery({
    queryKey: ["custom-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("custom_roles").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });

  // --- Mutations ---

  const createInviteMutation = useMutation({
    mutationFn: async (params: { type: "email" | "code"; email?: string }) => {
      const code = generateInviteCode();
      const insertData: any = {
        company_id: profile!.company_id,
        role: inviteRole,
        invite_code: code,
        invite_type: params.type,
        created_by: profile!.user_id,
        status: "pending",
      };
      if (params.email) insertData.email = params.email;
      if (inviteRole !== "admin") {
        if (!inviteLocationId) throw new Error("Location is required");
        insertData.location_id = inviteLocationId;
      }
      if (inviteCustomRoleIds.length > 0) {
        const names = inviteCustomRoleIds
          .map(id => customRoles.find((r: any) => r.id === id)?.name)
          .filter(Boolean);
        insertData.sub_role = names.join(",");
      }
      const { error } = await supabase.from("invitations").insert(insertData);
      if (error) throw error;
      return code;
    },
    onSuccess: (code) => {
      const link = `${window.location.origin}/invite/${code}`;
      setGeneratedLink(link);
      queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const quickInviteMutation = useMutation({
    mutationFn: async (roleName: string) => {
      const code = generateInviteCode();
      const insertData: any = {
        company_id: profile!.company_id,
        role: "staff",
        invite_code: code,
        invite_type: "code",
        created_by: profile!.user_id,
        status: "pending",
        sub_role: roleName,
      };
      const { error } = await supabase.from("invitations").insert(insertData);
      if (error) throw error;
      return { code, roleName };
    },
    onSuccess: ({ code, roleName }) => {
      const link = `${window.location.origin}/invite/${code}`;
      navigator.clipboard.writeText(link);
      toast.success(`Invite link for ${roleName} copied!`);
      queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invitations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation revoked");
      queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ userId, fullName }: { userId: string; fullName: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("user_id", userId);
      if (error) throw error;
    },
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ roleRowId, role, locationId }: { roleRowId: string; role: string; locationId: string | null }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({
          role: role as any,
          location_id: locationId,
        })
        .eq("id", roleRowId);
      if (error) throw error;
    },
  });

  const updateCustomRolesMutation = useMutation({
    mutationFn: async ({ userId, roleIds }: { userId: string; roleIds: string[] }) => {
      const { error: delError } = await supabase
        .from("user_custom_roles")
        .delete()
        .eq("user_id", userId);
      if (delError) throw delError;
      if (roleIds.length > 0) {
        const rows = roleIds.map(crId => ({
          user_id: userId,
          custom_role_id: crId,
          company_id: profile!.company_id,
        }));
        const { error: insError } = await supabase.from("user_custom_roles").insert(rows);
        if (insError) throw insError;
      }
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("User removed");
      setDeleteConfirmUser(null);
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-custom-roles"] });
    },
    onError: (error: any) => toast.error(error.message || "Failed to remove user"),
  });

  const saveUserEdits = async (p: any) => {
    const roleRow = p.user_roles?.[0];
    try {
      await updateProfileMutation.mutateAsync({ userId: p.user_id, fullName: editName });
      if (roleRow) {
        await updateUserRoleMutation.mutateAsync({
          roleRowId: roleRow.id,
          role: editRole,
          locationId: editLocationId && editLocationId !== "none" ? editLocationId : null,
        });
      }
      await updateCustomRolesMutation.mutateAsync({ userId: p.user_id, roleIds: editCustomRoleIds });
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-custom-roles"] });
      setEditingUserId(null);
      toast.success("User updated");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const startEditing = (p: any) => {
    const roleRow = p.user_roles?.[0];
    setEditingUserId(p.user_id);
    setEditName(p.full_name || "");
    setEditRole(roleRow?.role || "staff");
    setEditLocationId(roleRow?.location_id || "none");
    setEditCustomRoleIds(getUserCustomRoleIds(p.user_id));
  };

  // --- Helpers ---

  const handleCreateEmailInvite = () => {
    if (!inviteEmail.trim()) { toast.error("Email is required"); return; }
    createInviteMutation.mutate({ type: "email", email: inviteEmail.trim() });
  };

  const handleCreateCodeInvite = () => {
    createInviteMutation.mutate({ type: "code" });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Link copied!");
  };

  const resetDialog = () => {
    setInviteEmail("");
    setInviteRole("staff");
    setInviteLocationId("");
    setInviteCustomRoleIds([]);
    setGeneratedLink(null);
    setDialogStep(1);
  };

  const toggleCustomRoleId = (id: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  const getUserCustomRoleNames = (userId: string): string[] => {
    return allUserCustomRoles
      .filter((ucr: any) => ucr.user_id === userId)
      .map((ucr: any) => (ucr.custom_roles as any)?.name)
      .filter(Boolean);
  };

  const getUserCustomRoleIds = (userId: string): string[] => {
    return allUserCustomRoles
      .filter((ucr: any) => ucr.user_id === userId)
      .map((ucr: any) => ucr.custom_role_id);
  };

  const getLocationName = (locationId: string | null) => {
    if (!locationId) return null;
    return locations.find((l: any) => l.id === locationId)?.name || null;
  };

  const pendingInvites = invitations.filter((i: any) => i.status === "pending");

  // Apply filters to profiles
  const filteredProfiles = profiles.filter((p: any) => {
    // Name filter
    if (filterName && !(p.full_name || "").toLowerCase().includes(filterName.toLowerCase())) return false;
    // Role filter
    if (filterRole !== "all") {
      const roles = (p.user_roles || []).map((r: any) => r.role);
      if (!roles.includes(filterRole)) return false;
    }
    // Location filter
    if (filterLocationId !== "all") {
      const locIds = (p.user_roles || []).map((r: any) => r.location_id).filter(Boolean);
      if (!locIds.includes(filterLocationId)) return false;
    }
    // Custom role filter
    if (filterCustomRoleId !== "all") {
      const userCrIds = getUserCustomRoleIds(p.user_id);
      if (!userCrIds.includes(filterCustomRoleId)) return false;
    }
    return true;
  });

  const selectedCustomRoleNames = inviteCustomRoleIds
    .map(id => customRoles.find((r: any) => r.id === id)?.name)
    .filter(Boolean);

  const isAdminInvite = inviteRole === "admin";

  const selectedLocationName = inviteLocationId && inviteLocationId !== "none"
    ? locations.find((l: any) => l.id === inviteLocationId)?.name
    : null;

  const summaryParts = [
    inviteRole.charAt(0).toUpperCase() + inviteRole.slice(1),
    ...selectedCustomRoleNames,
    ...(isAdminInvite ? ["All Locations"] : selectedLocationName ? [selectedLocationName] : []),
  ];

  const hasCustomRoles = customRoles.length > 0;
  const maxStep = 4;

  const getNextStep = (current: number) => {
    if (current === 1 && !hasCustomRoles && isAdminInvite) return 4;
    if (current === 1 && !hasCustomRoles) return 3;
    if (current === 2 && isAdminInvite) return 4;
    if (current === 1 && isAdminInvite && hasCustomRoles) return 2;
    return current + 1;
  };

  const getPrevStep = (current: number) => {
    if (current === 4 && isAdminInvite && hasCustomRoles) return 2;
    if (current === 4 && isAdminInvite && !hasCustomRoles) return 1;
    if (current === 3 && !hasCustomRoles) return 1;
    return current - 1;
  };

  const renderDialogContent = () => {
    if (generatedLink) {
      return (
        <div className="space-y-4">
          <div className="rounded-xl  bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-2">This invite will join as:</p>
            <p className="text-sm font-display font-bold">{summaryParts.join(" · ")}</p>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl  bg-muted/50">
            <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <code className="text-xs flex-1 break-all">{generatedLink}</code>
            <Button size="sm" variant="ghost" onClick={() => copyToClipboard(generatedLink)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Share this link with the invitee. It expires in 7 days.</p>
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog} className="rounded-xl">Create Another</Button>
            <Button onClick={() => setDialogOpen(false)} className="rounded-xl">Done</Button>
          </DialogFooter>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-1.5 justify-center">
          {[1, 2, 3, 4].filter(s => (s !== 2 || hasCustomRoles) && (s !== 3 || !isAdminInvite)).map(s => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === dialogStep ? "w-6 bg-primary" : s < dialogStep ? "w-3 bg-primary/40" : "w-3 bg-muted"
              }`}
            />
          ))}
        </div>

        {dialogStep === 1 && (
          <div className="space-y-3">
            <Label className="text-sm font-display font-semibold">System Role</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["admin", "manager", "supervisor", "staff"] as const).map(role => {
                const Icon = roleIcons[role];
                const isSelected = inviteRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setInviteRole(role)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl  transition-all ${
                      isSelected ? "border-primary bg-primary/5 " : "border-muted hover:border-primary/30"
                    }`}
                  >
                    <Icon className={`h-6 w-6 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-display font-bold capitalize ${isSelected ? "text-primary" : "text-muted-foreground"}`}>{role}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {dialogStep === 2 && hasCustomRoles && (
          <div className="space-y-3">
            <Label className="text-sm font-display font-semibold">Custom Roles (optional)</Label>
            <p className="text-xs text-muted-foreground">Select roles to auto-assign when they join</p>
            <div className="flex flex-wrap gap-2">
              {customRoles.map((r: any) => {
                const isSelected = inviteCustomRoleIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleCustomRoleId(r.id, inviteCustomRoleIds, setInviteCustomRoleIds)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl  text-sm font-medium transition-all ${
                      isSelected ? "border-primary bg-primary/5 text-primary" : "border-muted text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <Tag className="h-3.5 w-3.5" />
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {dialogStep === 3 && !isAdminInvite && (
          <div className="space-y-3">
            <Label className="text-sm font-display font-semibold">Location <span className="text-destructive">*</span></Label>
            <Select value={inviteLocationId} onValueChange={setInviteLocationId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select a location" /></SelectTrigger>
              <SelectContent>
                {locations.map((loc: any) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!inviteLocationId && (
              <p className="text-xs text-destructive">A location is required to create an invitation</p>
            )}
          </div>
        )}

        {dialogStep === 4 && (
          <div className="space-y-4">
            <div className="rounded-xl  bg-muted/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">Invite summary</p>
              <p className="text-sm font-display font-bold">{summaryParts.join(" · ")}</p>
            </div>
            <Tabs defaultValue="code" className="w-full">
              <TabsList className="w-full rounded-xl">
                <TabsTrigger value="code" className="flex-1 rounded-lg gap-1.5"><Link2 className="h-3.5 w-3.5" />Invite Link</TabsTrigger>
                <TabsTrigger value="email" className="flex-1 rounded-lg gap-1.5"><Mail className="h-3.5 w-3.5" />Email Invite</TabsTrigger>
              </TabsList>
              <TabsContent value="code" className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  Generate a shareable link. Anyone with it can join as <span className="font-medium text-foreground">{summaryParts.join(" · ")}</span>.
                </p>
                <Button onClick={handleCreateCodeInvite} disabled={createInviteMutation.isPending} className="w-full rounded-xl">
                  {createInviteMutation.isPending ? "Generating..." : "Generate Invite Link"}
                </Button>
              </TabsContent>
              <TabsContent value="email" className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@company.com" className="rounded-xl h-11" />
                </div>
                <Button onClick={handleCreateEmailInvite} disabled={createInviteMutation.isPending} className="w-full rounded-xl">
                  {createInviteMutation.isPending ? "Creating..." : "Create Email Invite"}
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" size="sm" className="rounded-xl gap-1" onClick={() => setDialogStep(getPrevStep(dialogStep))} disabled={dialogStep === 1}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          {dialogStep < maxStep && (
            <Button size="sm" className="rounded-xl gap-1" onClick={() => setDialogStep(getNextStep(dialogStep))} disabled={dialogStep === 3 && !isAdminInvite && !inviteLocationId}>
              Next <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  if (selectedUser) {
    return <UserDetailView user={selectedUser} onBack={() => setSelectedUser(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Users</h1>
          <p className="text-muted-foreground">Manage team members and permissions</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetDialog(); }}>
          <DialogTrigger asChild>
            <Button className="rounded-xl gap-2"><UserPlus className="h-4 w-4" />Invite User</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display">Invite Team Member</DialogTitle>
              <DialogDescription>
                {dialogStep === 1 && "Choose the system role for this invite"}
                {dialogStep === 2 && "Optionally assign custom roles"}
                {dialogStep === 3 && "Select the location for this invite"}
                {dialogStep === 4 && "Generate or send the invite"}
              </DialogDescription>
            </DialogHeader>
            {renderDialogContent()}
          </DialogContent>
        </Dialog>
      </div>


      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <Card className="rounded-2xl ">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Pending Invitations ({pendingInvites.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {pendingInvites.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="secondary" className="rounded-lg capitalize shrink-0">{inv.role}</Badge>
                    {inv.sub_role && (
                      <Badge variant="outline" className="rounded-lg text-xs gap-1 shrink-0">
                        <Tag className="h-3 w-3" />{inv.sub_role}
                      </Badge>
                    )}
                    <span className="text-sm truncate">
                      {inv.email || (
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Link2 className="h-3 w-3" /> Link invite
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      expires {format(new Date(inv.expires_at), "MMM d")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => copyToClipboard(`${window.location.origin}/invite/${inv.invite_code}`)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => revokeInviteMutation.mutate(inv.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="rounded-2xl ">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name…"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                className="pl-9 rounded-xl h-10"
              />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-36 rounded-xl h-10">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
            {locations.length > 0 && (
              <Select value={filterLocationId} onValueChange={setFilterLocationId}>
                <SelectTrigger className="w-44 rounded-xl h-10">
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {locations.map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {customRoles.length > 0 && (
              <Select value={filterCustomRoleId} onValueChange={setFilterCustomRoleId}>
                <SelectTrigger className="w-44 rounded-xl h-10">
                  <SelectValue placeholder="All custom roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All custom roles</SelectItem>
                  {customRoles.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {(filterName || filterRole !== "all" || filterLocationId !== "all" || filterCustomRoleId !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl text-xs gap-1"
                onClick={() => { setFilterName(""); setFilterRole("all"); setFilterLocationId("all"); setFilterCustomRoleId("all"); }}
              >
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* User List */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="rounded-2xl  animate-pulse">
              <CardContent className="p-6 h-28" />
            </Card>
          ))}
        </div>
      ) : filteredProfiles.length === 0 ? (
        <Card className="rounded-2xl  -dashed">
          <CardContent className="flex flex-col items-center py-12">
            <UsersIcon className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              {profiles.length === 0 ? "No users yet." : "No users match these filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProfiles.map((p: any, i: number) => {
            const userRoles = p.user_roles || [];
            const roleRow = userRoles[0];
            const userCustomRoleNames = getUserCustomRoleNames(p.user_id);
            const isEditing = editingUserId === p.user_id;
            const locationName = roleRow ? getLocationName(roleRow.location_id) : null;

            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="rounded-2xl   hover:-primary/30 transition-all cursor-pointer" onClick={() => !isEditing && setSelectedUser({ user_id: p.user_id, full_name: p.full_name })}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-sm font-display font-bold text-primary">
                            {(p.full_name || "?")[0].toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          {isEditing ? (
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="h-8 text-sm font-display font-semibold rounded-lg"
                              placeholder="Full name"
                            />
                          ) : (
                            <>
                              <CardTitle className="text-base font-display truncate">{p.full_name || "Unnamed"}</CardTitle>
                              <p className="text-xs text-muted-foreground">{p.xp} XP</p>
                            </>
                          )}
                        </div>
                      </div>
                      {!isEditing && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); startEditing(p); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteConfirmUser({ user_id: p.user_id, full_name: p.full_name }); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {isEditing ? (
                      <div className="space-y-3" onClick={e => e.stopPropagation()}>
                        {/* System Role */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">System Role</Label>
                          <Select value={editRole} onValueChange={setEditRole}>
                            <SelectTrigger className="h-9 rounded-lg text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(["admin", "manager", "supervisor", "staff"] as const).map(r => (
                                <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Location */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Location</Label>
                          <Select value={editLocationId} onValueChange={setEditLocationId}>
                            <SelectTrigger className="h-9 rounded-lg text-sm">
                              <SelectValue placeholder="No location" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No location</SelectItem>
                              {locations.map((loc: any) => (
                                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Custom Roles */}
                        {customRoles.length > 0 && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">Custom Roles</Label>
                            <div className="border rounded-xl p-2 space-y-1.5 max-h-32 overflow-y-auto">
                              {customRoles.map((r: any) => (
                                <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                                  <Checkbox
                                    checked={editCustomRoleIds.includes(r.id)}
                                    onCheckedChange={() => toggleCustomRoleId(r.id, editCustomRoleIds, setEditCustomRoleIds)}
                                  />
                                  <span className="text-xs">{r.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Save / Cancel */}
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            className="h-8 rounded-lg text-xs gap-1 flex-1"
                            onClick={(e) => { e.stopPropagation(); saveUserEdits(p); }}
                            disabled={updateProfileMutation.isPending || updateUserRoleMutation.isPending}
                          >
                            <Check className="h-3.5 w-3.5" /> Save
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs gap-1" onClick={(e) => { e.stopPropagation(); setEditingUserId(null); }}>
                            <X className="h-3.5 w-3.5" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {userRoles.length === 0 && (
                            <Badge variant="outline" className="rounded-lg text-xs">No role</Badge>
                          )}
                          {userRoles.map((r: any, j: number) => {
                            const Icon = roleIcons[r.role as keyof typeof roleIcons] || User;
                            return (
                              <Badge key={j} className={`rounded-lg text-xs gap-1 ${roleColors[r.role] || ""}`} variant="secondary">
                                <Icon className="h-3 w-3" />{r.role}
                              </Badge>
                            );
                          })}
                          {locationName && (
                            <Badge variant="outline" className="rounded-lg text-xs gap-1">
                              <MapPin className="h-3 w-3" />{locationName}
                            </Badge>
                          )}
                          {userCustomRoleNames.map((name, j) => (
                            <Badge key={`cr-${j}`} variant="outline" className="rounded-lg text-xs gap-1">
                              <Tag className="h-3 w-3" />{name}
                            </Badge>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteConfirmUser} onOpenChange={(open) => { if (!open) setDeleteConfirmUser(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Remove User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently remove <span className="font-semibold text-foreground">{deleteConfirmUser?.full_name || "this user"}</span>? This will delete their account, roles, and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmUser && deleteUserMutation.mutate(deleteConfirmUser.user_id)}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? "Removing..." : "Remove User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
