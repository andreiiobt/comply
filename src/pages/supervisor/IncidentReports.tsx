import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";


export default function SupervisorIncidentReports() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const supervisorLocationId = roles.find((r) => r.role === "supervisor")?.location_id;
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["supervisor-incident-reports", supervisorLocationId],
    queryFn: async () => {
      let query = supabase
        .from("incident_reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (supervisorLocationId) {
        query = query.eq("location_id", supervisorLocationId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const userIds = [...new Set([
    ...reports.map((r: any) => r.user_id),
    ...reports.map((r: any) => r.assigned_to).filter(Boolean),
  ])];
  const { data: profileMap = {} } = useQuery({
    queryKey: ["sup-profiles-map", userIds],
    queryFn: async () => {
      if (!userIds.length) return {};
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      const map: Record<string, string> = {};
      (data || []).forEach((p) => { map[p.user_id] = p.full_name || "Unknown"; });
      return map;
    },
    enabled: userIds.length > 0,
  });

  const filtered = reports.filter((r: any) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          Incident Reports
        </h1>
        <p className="text-muted-foreground text-sm mt-1">View incident reports from your department.</p>
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No incident reports found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reporter</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r: any) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/supervisor/incidents/${r.id}`)}>
                    <TableCell className="text-sm tabular-nums whitespace-nowrap">
                      {format(new Date(r.incident_date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        to={`/supervisor/staff/${r.user_id}`}
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(profileMap as any)[r.user_id] || "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.assigned_to ? (
                        <Link
                          to={`/supervisor/staff/${r.assigned_to}`}
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(profileMap as any)[r.assigned_to] || "—"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{r.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{r.description}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-xs">{r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
