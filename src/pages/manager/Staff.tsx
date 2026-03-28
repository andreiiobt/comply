import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, User, CheckSquare, ChevronRight, ArrowLeft, CheckCircle2, Clock, XCircle } from "lucide-react";
import StaffChecklistDialog from "@/components/manager/StaffChecklistDialog";

type StaffMember = { user_id: string; full_name: string | null; avatar_url: string | null };

export default function ManagerStaff() {
  const { user, roles } = useAuth();
  const managerLocationId = roles.find((r) => r.role === "manager")?.location_id;
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [checklistDialog, setChecklistDialog] = useState<{
    staffUser: { user_id: string; full_name: string };
    block: any;
    sourceId: string;
    sourceTitle: string;
    existingSub: any;
  } | null>(null);

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

  // Get checklist submissions for selected staff
  const { data: staffChecklists = [] } = useQuery({
    queryKey: ["staff-checklists", selectedStaff?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("checklist_submissions")
        .select("*")
        .eq("user_id", selectedStaff!.user_id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!selectedStaff,
  });

  const statusBadge = (status: string) => {
    if (status === "approved") return <Badge variant="default" className="rounded-lg text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Approved</Badge>;
    if (status === "pending") return <Badge variant="secondary" className="rounded-lg text-xs gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    if (status === "rejected") return <Badge variant="destructive" className="rounded-lg text-xs gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
    return <Badge variant="outline" className="rounded-lg text-xs">{status}</Badge>;
  };

  if (selectedStaff) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedStaff(null)} className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold">{selectedStaff.full_name}</h1>
            <p className="text-muted-foreground text-sm">Checklist submissions</p>
          </div>
        </div>

        {staffChecklists.length === 0 ? (
          <Card className="rounded-2xl  -dashed">
            <CardContent className="flex flex-col items-center py-12">
              <CheckSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">No checklist submissions yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {staffChecklists.map((sub) => (
              <Card key={sub.id} className="rounded-2xl ">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-display font-semibold">
                      Submitted {new Date(sub.created_at).toLocaleDateString()}
                    </p>
                    {sub.reviewer_note && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{sub.reviewer_note}</p>
                    )}
                  </div>
                  {statusBadge(sub.status)}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {checklistDialog && (
          <StaffChecklistDialog
            open={!!checklistDialog}
            onOpenChange={(open) => !open && setChecklistDialog(null)}
            staffUser={checklistDialog.staffUser}
            block={checklistDialog.block}
            lessonId={checklistDialog.sourceId}
            lessonTitle={checklistDialog.sourceTitle}
            existingSubmission={checklistDialog.existingSub}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold">Staff</h1>
        <p className="text-muted-foreground">View and manage staff compliance at your location</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded-2xl animate-pulse" />)}
        </div>
      )}

      {!isLoading && staffList.length === 0 && (
        <Card className="rounded-2xl  -dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No staff members at your location</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {staffList.map((staff) => (
          <Card
            key={staff.user_id}
            className="rounded-2xl  hover:-primary/30 transition-colors cursor-pointer"
            onClick={() => setSelectedStaff(staff)}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <p className="font-display font-bold text-sm">{staff.full_name || "Unnamed"}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
