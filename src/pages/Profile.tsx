import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, ArrowLeft, CheckSquare, CheckCircle2, Clock, XCircle, Mail, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { toast } from "sonner";

export default function Profile() {
  const { profile, roles, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [address, setAddress] = useState(profile?.avatar_url || ""); // placeholder until profile loaded
  const [savingAddress, setSavingAddress] = useState(false);

  const { data: fullProfile } = useQuery({
    queryKey: ["full-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("email, address").eq("user_id", user!.id).single();
      if (data?.address) setAddress(data.address);
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

  const handleSaveAddress = async () => {
    setSavingAddress(true);
    const { error } = await supabase.from("profiles").update({ address } as any).eq("user_id", user!.id);
    setSavingAddress(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Address updated");
  };

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
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* Avatar & Name */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <Card className="rounded-2xl ">
            <CardContent className="p-6 text-center">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-display font-bold text-primary">
                  {(profile?.full_name || "?")[0].toUpperCase()}
                </span>
              </div>
              <h2 className="text-xl font-display font-bold">{profile?.full_name || "User"}</h2>
              <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                {roles.map((r, i) => (
                  <Badge key={i} variant="secondary" className="rounded-lg capitalize">{r.role}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Contact Info */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}>
          <Card className="rounded-2xl ">
            <CardContent className="p-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-display font-bold text-muted-foreground flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</Label>
                <p className="text-sm">{fullProfile?.email || user?.email || "—"}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-display font-bold text-muted-foreground flex items-center gap-1.5"><Home className="h-3.5 w-3.5" /> Address</Label>
                <div className="flex gap-2">
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter your address…" className="rounded-xl text-sm" />
                  <Button size="sm" className="rounded-xl shrink-0" onClick={handleSaveAddress} disabled={savingAddress}>
                    {savingAddress ? "…" : "Save"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: "Approved", value: approved, color: "text-primary" },
            { label: "Pending", value: pending, color: "text-muted-foreground" },
            { label: "Rejected", value: rejected, color: "text-destructive" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            >
              <Card className="rounded-2xl ">
                <CardContent className="p-3 text-center">
                  <p className={`text-lg font-display font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Recent Submissions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card className="rounded-2xl ">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                Recent Submissions
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {submissions.length === 0 ? (
                <div className="py-8 text-center">
                  <CheckSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No submissions yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {submissions.slice(0, 10).map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {sub.status === "approved" && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                        {sub.status === "pending" && <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
                        {sub.status === "rejected" && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                        <span className="text-sm truncate">{format(new Date(sub.created_at), "MMM d, yyyy")}</span>
                      </div>
                      <Badge
                        variant={sub.status === "approved" ? "default" : sub.status === "rejected" ? "destructive" : "secondary"}
                        className="rounded-lg text-xs capitalize"
                      >
                        {sub.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <Separator />

        <Button variant="outline" className="w-full h-12 rounded-xl gap-2" onClick={signOut}>
          <LogOut className="h-4 w-4" /> Sign Out
        </Button>
      </div>
    </div>
  );
}
