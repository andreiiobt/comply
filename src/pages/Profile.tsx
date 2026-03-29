import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  LogOut,
  ArrowLeft,
  CheckSquare,
  Shield,
  Pencil,
  MapPin,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function Profile() {
  const { profile, roles, user, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  
  const [address, setAddress] = useState("");
  const [fullName, setFullName] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initialize locals from profile context immediately if available
  useState(() => {
    if (profile?.full_name) setFullName(profile.full_name);
    if (profile?.avatar_url) setAddress(profile.avatar_url); // avatar_url was used as placeholder for address in old code
  });

  const { data: fullProfile } = useQuery({
    queryKey: ["full-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("email, address, full_name")
        .eq("user_id", user!.id)
        .single();
      
      if (data?.address) setAddress(data.address);
      if (data?.full_name) setFullName(data.full_name);
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["profile-submissions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_submissions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      setSaving(true);
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          address: address,
        } as any)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["full-profile"] });
      // Also invalidate session-based profile if needed
      toast.success("Profile updated");
      setIsEditDialogOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to save"),
    onSettled: () => setSaving(false),
  });

  const approved = submissions.filter((s) => s.status === "approved").length;
  const pending = submissions.filter((s) => s.status === "pending").length;
  const rejected = submissions.filter((s) => s.status === "rejected").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-display font-bold">Profile</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-8">
        {/* User Header */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center text-center space-y-4"
        >
          <div className="relative group">
            <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center border-4 border-background ring-2 ring-primary/5">
              <span className="text-3xl font-display font-bold text-primary">
                {(fullName || "?")[0].toUpperCase()}
              </span>
            </div>
            
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogTrigger asChild>
                <button className="absolute bottom-0 right-0 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background shadow-lg active:scale-90 hover:scale-105 transition-all">
                  <Pencil className="h-4 w-4" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xs rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="font-display">Edit Profile</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Full Name</Label>
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter full name"
                      className="rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Address</Label>
                    <Input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Enter your address"
                      className="rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-1 px-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Email</Label>
                    <p className="text-sm text-muted-foreground">{fullProfile?.email || user?.email}</p>
                  </div>
                </div>
                <DialogFooter className="pt-2">
                  <Button
                    className="w-full h-11 rounded-xl font-semibold"
                    onClick={() => updateProfileMutation.mutate()}
                    disabled={saving}
                  >
                    {saving ? "Saving Changes..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-display font-bold">{fullName || "User"}</h2>
            <div className="flex flex-wrap justify-center gap-1.5">
              {roles.map((r, i) => (
                <Badge key={i} variant="secondary" className="rounded-lg capitalize px-2.5 py-0.5 border-primary/10">
                  {r.role}
                </Badge>
              ))}
            </div>
            {address && (
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1 opacity-80">
                <MapPin className="h-3 w-3" /> {address}
              </p>
            )}
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Approved", value: approved, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
            { label: "Pending", value: pending, color: "text-muted-foreground", bg: "bg-muted/30 border-muted/20" },
            { label: "Rejected", value: rejected, color: "text-destructive", bg: "bg-destructive/5 border-destructive/10" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + (0.05 * i), duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className={`rounded-2xl p-4 text-center border ${stat.bg}`}
            >
              <p className={`text-2xl font-display font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
              <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Action Links */}
        <div className="space-y-3 pt-2">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-1 pb-1">My Activity</p>
          
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/compliance")}
            className="w-full bg-card border rounded-2xl p-4 flex items-center justify-between group hover:border-primary/40 hover:shadow-sm transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-display font-bold text-[15px]">My Compliance</p>
                <p className="text-xs text-muted-foreground mt-0.5">Policies, licenses & certifications</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/my-submissions")}
            className="w-full bg-card border rounded-2xl p-4 flex items-center justify-between group hover:border-primary/40 hover:shadow-sm transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <CheckSquare className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-display font-bold text-[15px]">Recent Submissions</p>
                <p className="text-xs text-muted-foreground mt-0.5">View your history of completed checklists</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          </motion.button>
        </div>

        <div className="pt-6">
          <Button 
            variant="ghost" 
            className="w-full h-12 rounded-2xl gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors" 
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
