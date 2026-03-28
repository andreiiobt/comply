import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Tag } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function CustomRoles() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [newRole, setNewRole] = useState("");
  const [deletingRole, setDeletingRole] = useState<{ id: string; name: string } | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>("");

  const companyId = profile?.company_id;

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["custom-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_roles")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!companyId) throw new Error("No company");
      const { error } = await supabase
        .from("custom_roles")
        .insert({ company_id: companyId, name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
      setNewRole("");
      toast.success("Custom role created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ roleId, targetId }: { roleId: string; targetId: string }) => {
      if (targetId) {
        // Reassign users to the target role
        const { error: reassignError } = await supabase
          .from("user_custom_roles")
          .update({ custom_role_id: targetId })
          .eq("custom_role_id", roleId);
        if (reassignError) throw reassignError;
      } else {
        // Remove user_custom_roles entries for the deleted role
        const { error: removeError } = await supabase
          .from("user_custom_roles")
          .delete()
          .eq("custom_role_id", roleId);
        if (removeError) throw removeError;
      }
      const { error } = await supabase.from("custom_roles").delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
      toast.success("Custom role deleted");
      setDeletingRole(null);
      setReassignTargetId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!newRole.trim()) return;
    createMutation.mutate(newRole);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Custom Roles</h1>
        <p className="text-muted-foreground">
          Define custom roles like "Barista" or "Kitchen" to target learning path assignments
        </p>
      </div>

      {/* Add new role */}
      <Card className="rounded-2xl ">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Input
              placeholder="e.g. Barista, Shift Lead, Kitchen..."
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="rounded-xl h-11"
            />
            <Button
              onClick={handleCreate}
              disabled={!newRole.trim() || createMutation.isPending}
              className="rounded-xl gap-2 shrink-0"
            >
              <Plus className="h-4 w-4" />
              Add Role
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Role list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="rounded-2xl  animate-pulse">
              <CardContent className="p-4 h-16" />
            </Card>
          ))}
        </div>
      ) : roles.length === 0 ? (
        <Card className="rounded-2xl  -dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Tag className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-display font-semibold">No custom roles yet</p>
            <p className="text-sm text-muted-foreground">Create roles to target learning path assignments</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {roles.map((role: any, i: number) => (
            <motion.div
              key={role.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="rounded-2xl ">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                      <Tag className="h-5 w-5 text-accent-foreground" />
                    </div>
                    <span className="font-display font-bold text-sm">{role.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setDeletingRole(role);
                      setReassignTargetId("");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Delete / Reassign Dialog */}
      <AlertDialog open={!!deletingRole} onOpenChange={(open) => { if (!open) { setDeletingRole(null); setReassignTargetId(""); } }}>
        <AlertDialogContent className="sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingRole?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Users assigned to this role will lose it. You can optionally reassign them to another role before deleting.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {roles.filter((r: any) => r.id !== deletingRole?.id).length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Reassign users to (optional)</label>
              <Select value={reassignTargetId} onValueChange={setReassignTargetId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Don't reassign" />
                </SelectTrigger>
                <SelectContent>
                  {roles
                    .filter((r: any) => r.id !== deletingRole?.id)
                    .map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deletingRole) {
                  deleteMutation.mutate({ roleId: deletingRole.id, targetId: reassignTargetId });
                }
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
