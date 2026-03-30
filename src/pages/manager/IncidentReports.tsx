import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, MapPin, FileText, ShieldAlert, Search, Clock } from "lucide-react";
import { useState, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";

export default function ManagerIncidentReports() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const managerLocationId = roles.find((r) => r.role === "manager")?.location_id;
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch location info
  const { data: location } = useQuery({
    queryKey: ["manager-location", managerLocationId],
    queryFn: async () => {
      if (!managerLocationId) return null;
      const { data } = await supabase
        .from("locations")
        .select("id, name, address")
        .eq("id", managerLocationId)
        .single();
      return data;
    },
    enabled: !!managerLocationId,
  });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["manager-incident-reports", managerLocationId],
    queryFn: async () => {
      let query = supabase
        .from("incident_reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (managerLocationId) {
        query = query.eq("location_id", managerLocationId);
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
    queryKey: ["profiles-map", userIds],
    queryFn: async () => {
      if (!userIds.length) return {};
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      const map: Record<string, string> = {};
      (data || []).forEach((p) => { map[p.user_id] = p.full_name || "Unknown"; });
      return map;
    },
    enabled: userIds.length > 0,
  });

  const stats = useMemo(() => {
    const s = { total: 0, open: 0, investigating: 0, resolved: 0 };
    reports.forEach((r: any) => {
      s.total++;
      if (r.status === "open") s.open++;
      if (r.status === "investigating") s.investigating++;
      if (r.status === "resolved") s.resolved++;
    });
    return s;
  }, [reports]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    await supabase.from("incident_reports").update({ status: newStatus }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["manager-incident-reports"] });
  };

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
        <p className="text-muted-foreground text-sm mt-1">View incident reports from your location.</p>
      </div>

      {/* Location header card with summary stats */}
      {location && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              {location.name}
            </CardTitle>
            {location.address && (
              <p className="text-xs text-muted-foreground">{location.address}</p>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-3 flex-wrap">
              <Badge variant="secondary" className="text-sm px-3 py-1">
                <FileText className="h-3.5 w-3.5 mr-1" />
                {stats.total} Total
              </Badge>
              <Badge variant="destructive" className="text-sm px-3 py-1">
                <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                {stats.open} Open
              </Badge>
              <Badge className="text-sm px-3 py-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
                <Search className="h-3.5 w-3.5 mr-1" />
                {stats.investigating} Investigating
              </Badge>
              <Badge className="text-sm px-3 py-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                <Clock className="h-3.5 w-3.5 mr-1" />
                {stats.resolved} Resolved
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

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
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-7 w-28 rounded-lg" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState inline icon={AlertTriangle} title="No incident reports found" description="Try adjusting the status filter." />
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
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/manager/incidents/${r.id}`)}>
                    <TableCell className="text-sm tabular-nums whitespace-nowrap">
                      {format(new Date(r.incident_date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        to={`/manager/staff/${r.user_id}`}
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(profileMap as any)[r.user_id] || "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.assigned_to ? (
                        <Link
                          to={`/manager/staff/${r.assigned_to}`}
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
                      <Select value={r.status} onValueChange={(v) => handleStatusChange(r.id, v)}>
                        <SelectTrigger className="h-7 w-[120px] rounded-lg text-xs" onClick={(e) => e.stopPropagation()}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="investigating">Investigating</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
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
