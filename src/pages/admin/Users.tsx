import { useState } from "react";
import UserDetailView from "@/components/admin/UserDetailView";
import { UserCard } from "@/components/admin/UserCard";
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
import { Users as UsersIcon, Shield, UserCog, User, UserPlus, Copy, Link2, Mail, Trash2, Clock, Tag, ArrowLeft, ArrowRight, Search, Filter, Eye, ChevronRight, Home, X } from "lucide-react";
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
  admin: "bg-primary/10 text-primary border-primary/20",
  manager: "bg-secondary/10 text-secondary border-secondary/20",
  supervisor: "bg-accent/10 text-accent-foreground border-accent/20",
  staff: "bg-muted text-muted-foreground border-muted-foreground/20",
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
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    role: "staff",
    locationId: "none",
    customRoleIds: [] as string[],
  });

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

      if (params.type === "email" && params.email) {
        const { error: sendError } = await supabase.functions.invoke("send-invite-email", {
          body: { inviteCode: code, email: params.email },
        });
        if (sendError) throw new Error(`Invite created but email failed to send: ${sendError.message}`);
      }

      return { code, type: params.type };
    },
    onSuccess: ({ code, type }) => {
      const link = `${window.location.origin}/invite/${code}`;
      setGeneratedLink(link);
      queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
      if (type === "email") {
        toast.success("Invite email sent");
      }
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

  const saveUserEdits = async () => {
    if (!editingUser) return;
    const roleRow = editingUser.user_roles?.[0];
    try {
      await updateProfileMutation.mutateAsync({ userId: editingUser.user_id, fullName: editForm.name });
      if (roleRow) {
        await updateUserRoleMutation.mutateAsync({
          roleRowId: roleRow.id,
          role: editForm.role,
          locationId: editForm.locationId && editForm.locationId !== "none" ? editForm.locationId : null,
        });
      }
      await updateCustomRolesMutation.mutateAsync({ userId: editingUser.user_id, roleIds: editForm.customRoleIds });
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-custom-roles"] });
      setEditingUser(null);
      toast.success("User updated");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const startEditing = (p: any) => {
    const roleRow = p.user_roles?.[0];
    setEditingUser(p);
    setEditForm({
      name: p.full_name || "",
      role: roleRow?.role || "staff",
      locationId: roleRow?.location_id || "none",
      customRoleIds: getUserCustomRoleIds(p.user_id),
    });
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
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Home className="h-4 w-4" />
        <ChevronRight className="h-3 w-3" />
        <span>People</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium">Users</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Users</h1>
          <p className="text-muted-foreground">Manage team members and permissions</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetDialog(); }}>
          <DialogTrigger asChild>
            <Button className="rounded-xl gap-2 h-11 px-6 font-display font-bold">
              <UserPlus className="h-4 w-4" />
              Invite User
            </Button>
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
        <Card className="rounded-2xl border-none bg-muted/30">
          <CardHeader className="pb-3 px-4 pt-4">
            <CardTitle className="text-sm font-display font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <Clock className="h-4 w-4" />
              Pending Invitations ({pendingInvites.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <div className="grid gap-2">
              {pendingInvites.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-background/50 hover:bg-background transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Mail className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {inv.email || "Link Invite"}
                        </span>
                        <Badge variant="outline" className={`text-xs px-1.5 h-4 capitalize border-none ${roleColors[inv.role] || ""}`}>
                          {inv.role}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          Expires {format(new Date(inv.expires_at), "MMM d")}
                        </span>
                        {inv.sub_role && (
                          <span className="flex items-center gap-1">
                            <Tag className="h-2.5 w-2.5" />
                            {inv.sub_role.split(",").join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => copyToClipboard(`${window.location.origin}/invite/${inv.invite_code}`)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => revokeInviteMutation.mutate(inv.id)}>
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name…"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            className="pl-9 rounded-xl h-11 border-none bg-muted/30 focus-visible:ring-primary/20"
          />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-36 rounded-xl h-11 border-none bg-muted/30 focus:ring-primary/20">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="supervisor">Supervisor</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
          </SelectContent>
        </Select>
        {locations.length > 0 && (
          <Select value={filterLocationId} onValueChange={setFilterLocationId}>
            <SelectTrigger className="w-44 rounded-xl h-11 border-none bg-muted/30 focus:ring-primary/20">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">All locations</SelectItem>
              {locations.map((loc: any) => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {customRoles.length > 0 && (
          <Select value={filterCustomRoleId} onValueChange={setFilterCustomRoleId}>
            <SelectTrigger className="w-44 rounded-xl h-11 border-none bg-muted/30 focus:ring-primary/20">
              <SelectValue placeholder="All custom roles" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
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
            className="rounded-xl text-xs gap-1 h-11 px-4 hover:bg-muted/50"
            onClick={() => { setFilterName(""); setFilterRole("all"); setFilterLocationId("all"); setFilterCustomRoleId("all"); }}
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </Button>
        )}
      </div>

      {/* User List */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="rounded-2xl h-48 animate-pulse bg-muted/20" />
          ))}
        </div>
      ) : filteredProfiles.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
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
            const locationName = roleRow ? getLocationName(roleRow.location_id) : null;

            return (
              <UserCard
                key={p.user_id}
                user={p}
                role={roleRow?.role}
                locationName={locationName}
                customRoles={userCustomRoleNames}
                index={i}
                onClick={() => setSelectedUser({ user_id: p.user_id, full_name: p.full_name })}
                onEdit={() => startEditing(p)}
                onDelete={() => setDeleteConfirmUser({ user_id: p.user_id, full_name: p.full_name })}
              />
            );
          })}
        </div>
      )}

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Edit User Profile</DialogTitle>
            <DialogDescription>Update system details for {editingUser?.full_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                className="h-11 rounded-xl"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>System Role</Label>
                <Select value={editForm.role} onValueChange={(r) => setEditForm(prev => ({ ...prev, role: r }))}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["admin", "manager", "supervisor", "staff"] as const).map(r => (
                      <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Primary Location</Label>
                <Select value={editForm.locationId} onValueChange={(l) => setEditForm(prev => ({ ...prev, locationId: l }))}>
                  <SelectTrigger className="h-11 rounded-xl">
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
            </div>

            {customRoles.length > 0 && (
              <div className="space-y-2">
                <Label>Custom Roles</Label>
                <div className="flex flex-wrap gap-2 p-3 rounded-xl border bg-muted/20">
                  {customRoles.map((r: any) => {
                    const isSelected = editForm.customRoleIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleCustomRoleId(r.id, editForm.customRoleIds, (v) => setEditForm(prev => ({ ...prev, customRoleIds: v })))}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        <Tag className="h-3 w-3" />
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)} className="rounded-xl">Cancel</Button>
            <Button onClick={saveUserEdits} className="rounded-xl" disabled={updateProfileMutation.isPending || updateUserRoleMutation.isPending}>
              {updateProfileMutation.isPending || updateUserRoleMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
