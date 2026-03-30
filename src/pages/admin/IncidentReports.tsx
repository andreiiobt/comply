import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, MapPin, ArrowLeft, FileText, Clock, Search, ShieldAlert } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { incidentStatusConfig } from "@/lib/statusColors";

export default function AdminIncidentReports() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: locations = [] } = useQuery({
    queryKey: ["admin-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, address")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["admin-incident-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_reports")
        .select("*")
        .order("created_at", { ascending: false });
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

  // Group reports by location
  const locationStats = useMemo(() => {
    const grouped: Record<string, { total: number; open: number; investigating: number; resolved: number; latest: string | null }> = {};
    
    // Initialize all locations
    locations.forEach((loc) => {
      grouped[loc.id] = { total: 0, open: 0, investigating: 0, resolved: 0, latest: null };
    });
    grouped["__none__"] = { total: 0, open: 0, investigating: 0, resolved: 0, latest: null };

    reports.forEach((r: any) => {
      const key = r.location_id || "__none__";
      if (!grouped[key]) grouped[key] = { total: 0, open: 0, investigating: 0, resolved: 0, latest: null };
      grouped[key].total++;
      if (r.status === "open") grouped[key].open++;
      if (r.status === "investigating") grouped[key].investigating++;
      if (r.status === "resolved") grouped[key].resolved++;
      if (!grouped[key].latest || r.incident_date > grouped[key].latest!) {
        grouped[key].latest = r.incident_date;
      }
    });

    return grouped;
  }, [reports, locations]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    await supabase.from("incident_reports").update({ status: newStatus }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["admin-incident-reports"] });
  };

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);
  const selectedLocationName = selectedLocationId === "__none__" ? "No Location" : selectedLocation?.name || "";

  const filteredReports = reports.filter((r: any) => {
    if (selectedLocationId === "__none__") {
      if (r.location_id) return false;
    } else if (selectedLocationId) {
      if (r.location_id !== selectedLocationId) return false;
    }
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  // Location overview cards
  if (!selectedLocationId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            Incident Reports
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Select a location to view its incident reports.</p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="rounded-2xl">
                <CardContent className="p-6 space-y-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : locations.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No locations yet"
            description="Add locations to start tracking incident reports by site."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {locations.map((loc) => {
              const stats = locationStats[loc.id] || { total: 0, open: 0, investigating: 0, resolved: 0, latest: null };
              return (
                <Card
                  key={loc.id}
                  className="rounded-2xl cursor-pointer hover:-primary/50  transition-all"
                  onClick={() => setSelectedLocationId(loc.id)}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {loc.name}
                    </CardTitle>
                    {loc.address && (
                      <p className="text-xs text-muted-foreground">{loc.address}</p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{stats.total}</span>
                        <span className="text-muted-foreground">Total</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                        <span className="font-medium">{stats.open}</span>
                        <span className="text-muted-foreground">Open</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Search className="h-3.5 w-3.5 text-amber-500" />
                        <span className="font-medium">{stats.investigating}</span>
                        <span className="text-muted-foreground">Investigating</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="font-medium">{stats.resolved}</span>
                        <span className="text-muted-foreground">Resolved</span>
                      </div>
                    </div>
                    {stats.latest && (
                      <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                        Latest: {format(new Date(stats.latest), "MMM d, yyyy")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* No Location card */}
            {(() => {
              const stats = locationStats["__none__"] || { total: 0, open: 0, investigating: 0, resolved: 0, latest: null };
              if (stats.total === 0) return null;
              return (
                <Card
                  className="rounded-2xl cursor-pointer hover:border-primary/50  transition-all -dashed"
                  onClick={() => setSelectedLocationId("__none__")}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      No Location
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{stats.total}</span>
                        <span className="text-muted-foreground">Total</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                        <span className="font-medium">{stats.open}</span>
                        <span className="text-muted-foreground">Open</span>
                      </div>
                    </div>
                    {stats.latest && (
                      <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                        Latest: {format(new Date(stats.latest), "MMM d, yyyy")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        )}
      </div>
    );
  }

  // Drill-down: report table for selected location
  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground"
          onClick={() => { setSelectedLocationId(null); setStatusFilter("all"); }}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          All Locations
        </Button>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          {selectedLocationName}
        </h1>
        {selectedLocation?.address && (
          <p className="text-muted-foreground text-sm mt-1">{selectedLocation.address}</p>
        )}
      </div>

      {/* Summary stats bar */}
      {(() => {
        const stats = locationStats[selectedLocationId] || { total: 0, open: 0, investigating: 0, resolved: 0 };
        return (
          <div className="flex gap-3 flex-wrap">
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {stats.total} Total
            </Badge>
            <Badge variant="destructive" className="text-sm px-3 py-1">
              {stats.open} Open
            </Badge>
            <Badge className="text-sm px-3 py-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
              {stats.investigating} Investigating
            </Badge>
            <Badge className="text-sm px-3 py-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              {stats.resolved} Resolved
            </Badge>
          </div>
        );
      })()}

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
          {filteredReports.length === 0 ? (
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
                {filteredReports.map((r: any) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/incidents/${r.id}`)}>
                    <TableCell className="text-sm tabular-nums whitespace-nowrap">
                      {format(new Date(r.incident_date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        to={`/admin/users/${r.user_id}`}
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(profileMap as any)[r.user_id] || "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.assigned_to ? (
                        <Link
                          to={`/admin/users/${r.assigned_to}`}
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
