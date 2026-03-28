import React, { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line } from "recharts";
import { AlertTriangle, ShieldAlert, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format, subDays, startOfDay, subWeeks, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";

const ALL = "__all__";

const SEVERITY_COLORS: Record<string, string> = {
  low: "hsl(142 71% 45%)",
  medium: "hsl(38 92% 50%)",
  high: "hsl(15 80% 55%)",
  critical: "hsl(0 84% 60%)",
};

const STATUS_COLORS: Record<string, string> = {
  open: "hsl(38 92% 50%)",
  investigating: "hsl(var(--primary))",
  resolved: "hsl(142 71% 45%)",
  closed: "hsl(0 0% 55%)",
};

type Props = {
  selectedLocation?: string;
  onExportCsvRef?: (fn: (() => void) | null) => void;
};

export default function IncidentAnalyticsTab({ selectedLocation = ALL, onExportCsvRef }: Props) {
  const { profile } = useAuth();
  const enabled = !!profile?.company_id;

  const { data: incidents = [] } = useQuery({
    queryKey: ["incident-reports-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_reports")
        .select("id, user_id, status, severity, title, description, incident_date, location_id, created_at, involved_user_ids");
      if (error) throw error;
      return data;
    },
    enabled,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["compliance-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name");
      if (error) throw error;
      return data;
    },
    enabled,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["compliance-locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id, name");
      if (error) throw error;
      return data;
    },
    enabled,
  });

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach((p) => { m[p.user_id] = p.full_name || "Unknown"; });
    return m;
  }, [profiles]);

  const locationMap = useMemo(() => {
    const m: Record<string, string> = {};
    locations.forEach((l) => { m[l.id] = l.name; });
    return m;
  }, [locations]);

  const filtered = useMemo(() => {
    if (selectedLocation === ALL) return incidents;
    return incidents.filter((i) => i.location_id === selectedLocation);
  }, [incidents, selectedLocation]);

  // Summary stats
  const total = filtered.length;
  const openCount = filtered.filter((i) => i.status === "open").length;
  const investigatingCount = filtered.filter((i) => i.status === "investigating").length;
  const resolvedCount = filtered.filter((i) => i.status === "resolved" || i.status === "closed").length;
  const criticalCount = filtered.filter((i) => i.severity === "critical" || i.severity === "high").length;

  // Severity breakdown donut
  const severityData = useMemo(() => {
    const counts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    filtered.forEach((i) => { counts[i.severity] = (counts[i.severity] || 0) + 1; });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, color: SEVERITY_COLORS[name] || "hsl(0 0% 50%)" }));
  }, [filtered]);

  // Status breakdown donut
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((i) => { counts[i.status] = (counts[i.status] || 0) + 1; });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, color: STATUS_COLORS[name] || "hsl(0 0% 50%)" }));
  }, [filtered]);

  // Incidents over time (30 days)
  const trendData = useMemo(() => {
    const now = new Date();
    const days: { date: string; count: number; high: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = startOfDay(subDays(now, i));
      const dayStr = format(day, "yyyy-MM-dd");
      const label = format(day, "MMM d");
      const dayIncidents = filtered.filter((s) => format(new Date(s.incident_date), "yyyy-MM-dd") === dayStr);
      days.push({
        date: label,
        count: dayIncidents.length,
        high: dayIncidents.filter((s) => s.severity === "high" || s.severity === "critical").length,
      });
    }
    return days;
  }, [filtered]);

  const trendChartConfig = {
    count: { label: "All Incidents", color: "hsl(var(--primary))" },
    high: { label: "High/Critical", color: "hsl(0 84% 60%)" },
  };

  // By location
  const locationData = useMemo(() => {
    return locations.map((loc) => {
      const locIncidents = filtered.filter((i) => i.location_id === loc.id);
      return { name: loc.name, count: locIncidents.length, open: locIncidents.filter((i) => i.status === "open").length };
    }).filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
  }, [locations, filtered]);

  const locationChartConfig = {
    count: { label: "Total", color: "hsl(var(--primary))" },
    open: { label: "Open", color: "hsl(38 92% 50%)" },
  };

  // Weekly trend (12 weeks)
  const weeklyData = useMemo(() => {
    const now = new Date();
    const weeks: { week: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(now, i));
      const weekEnd = endOfWeek(subWeeks(now, i));
      const weekIncidents = filtered.filter((s) => {
        const d = new Date(s.incident_date);
        return isWithinInterval(d, { start: weekStart, end: weekEnd });
      });
      weeks.push({ week: format(weekStart, "MMM d"), count: weekIncidents.length });
    }
    return weeks;
  }, [filtered]);

  const weeklyChartConfig = {
    count: { label: "Incidents", color: "hsl(var(--primary))" },
  };

  // Recent incidents table
  const recentIncidents = useMemo(() => {
    return [...filtered]
      .sort((a, b) => new Date(b.incident_date).getTime() - new Date(a.incident_date).getTime())
      .slice(0, 15);
  }, [filtered]);

  // Top reporters
  const topReporters = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((i) => { counts[i.user_id] = (counts[i.user_id] || 0) + 1; });
    return Object.entries(counts)
      .map(([userId, count]) => ({ name: profileMap[userId] || "Unknown", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filtered, profileMap]);

  // Most involved users
  const involvedUsers = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((i) => {
      const ids = Array.isArray(i.involved_user_ids) ? i.involved_user_ids as string[] : [];
      ids.forEach((uid) => { counts[uid] = (counts[uid] || 0) + 1; });
    });
    return Object.entries(counts)
      .map(([userId, count]) => ({ name: profileMap[userId] || "Unknown", userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filtered, profileMap]);

  function severityBadge(severity: string) {
    const variant = severity === "critical" || severity === "high" ? "destructive" : severity === "medium" ? "secondary" : "outline";
    return <Badge variant={variant} className="text-[10px]">{severity}</Badge>;
  }

  function statusBadge(status: string) {
    const variant = status === "open" ? "secondary" : status === "resolved" || status === "closed" ? "outline" : "default";
    return <Badge variant={variant} className="text-[10px]">{status}</Badge>;
  }

  const exportIncidentsCsv = useCallback(() => {
    const headers = ["Incident Date", "Title", "Reporter", "Severity", "Status", "Location", "Involved Individuals", "Description"];
    const now = new Date();
    const rows = filtered.map((i) => {
      const involvedNames = Array.isArray(i.involved_user_ids)
        ? (i.involved_user_ids as string[]).map((uid) => profileMap[uid] || "Unknown").join("; ")
        : "";
      return [
        format(new Date(i.incident_date), "yyyy-MM-dd"),
        (i.title || "").replace(/"/g, '""'),
        profileMap[i.user_id] || "Unknown",
        i.severity,
        i.status,
        i.location_id ? locationMap[i.location_id] || "" : "",
        involvedNames,
        (i.description || "").replace(/"/g, '""').replace(/\n/g, " "),
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incident-report-${format(now, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, profileMap, locationMap]);

  // Expose export function to parent
  React.useEffect(() => {
    onExportCsvRef?.(exportIncidentsCsv);
    return () => onExportCsvRef?.(null);
  }, [exportIncidentsCsv, onExportCsvRef]);

  return (
    <div className="space-y-6 min-w-0 overflow-hidden">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Card className="min-w-0 overflow-hidden">
          <CardContent className="pt-5 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Total Incidents</p>
                <p className="text-xl sm:text-2xl font-bold tabular-nums">{total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden">
          <CardContent className="pt-5 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Open</p>
                <p className="text-xl sm:text-2xl font-bold tabular-nums">{openCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden">
          <CardContent className="pt-5 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Investigating</p>
                <p className="text-xl sm:text-2xl font-bold tabular-nums">{investigatingCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden">
          <CardContent className="pt-5 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Resolved</p>
                <p className="text-xl sm:text-2xl font-bold tabular-nums">{resolvedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden">
          <CardContent className="pt-5 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">High / Critical</p>
                <p className="text-xl sm:text-2xl font-bold tabular-nums">{criticalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Incident Trends (30 days)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <ChartContainer config={trendChartConfig} className="h-[250px] sm:h-[280px] w-full">
              <BarChart data={trendData} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={6} angle={-45} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" stackId="a" fill="var(--color-count)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="high" fill="var(--color-high)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base font-semibold">By Severity</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center overflow-hidden">
            {severityData.length > 0 ? (
              <div className="w-full">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={severityData} cx="50%" cy="50%" innerRadius={44} outerRadius={72} dataKey="value" stroke="none">
                      {severityData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                  {severityData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                      <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-medium tabular-nums">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-12">No incident data</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base font-semibold">By Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center overflow-hidden">
            {statusData.length > 0 ? (
              <div className="w-full">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={44} outerRadius={72} dataKey="value" stroke="none">
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                  {statusData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                      <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-medium tabular-nums">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-12">No incident data</p>
            )}
          </CardContent>
        </Card>

        {locationData.length > 0 && (
          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base font-semibold">By Location</CardTitle>
            </CardHeader>
            <CardContent className="overflow-hidden">
              <ChartContainer config={locationChartConfig} className="h-[240px] w-full">
                <BarChart data={locationData} layout="vertical" margin={{ left: 0, right: 8 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={72} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} barSize={20} />
                  <Bar dataKey="open" fill="var(--color-open)" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Weekly Incident Trend (12 weeks)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-hidden">
          <ChartContainer config={weeklyChartConfig} className="h-[240px] w-full">
            <LineChart data={weeklyData} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
              <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="count" stroke="var(--color-count)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Top Reporters</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {topReporters.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Reports</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topReporters.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium truncate max-w-[180px]">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">No reporters</p>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Most Involved Individuals</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {involvedUsers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Incidents</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {involvedUsers.map((u, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium truncate max-w-[180px]">{u.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{u.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">No involved individuals</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Recent Incidents</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {recentIncidents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Reporter</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentIncidents.map((inc) => (
                  <TableRow key={inc.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(inc.incident_date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium max-w-[180px] truncate">{inc.title}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{profileMap[inc.user_id] || "Unknown"}</TableCell>
                    <TableCell className="max-w-[140px] truncate">{inc.location_id ? locationMap[inc.location_id] || "—" : "—"}</TableCell>
                    <TableCell>{severityBadge(inc.severity)}</TableCell>
                    <TableCell>{statusBadge(inc.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">No incidents recorded</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
