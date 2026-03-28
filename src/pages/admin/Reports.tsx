import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line } from "recharts";
import { ClipboardCheck, CheckCircle2, Clock, XCircle, AlertTriangle, Download, Printer, Timer, ShieldAlert } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import IncidentAnalyticsTab from "@/components/IncidentAnalyticsTab";
import { format, subDays, differenceInDays, startOfDay, subWeeks, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";

const ALL = "__all__";
const OVERDUE_DAYS = 7;

export default function Reports() {
  const { profile } = useAuth();
  const [selectedLocation, setSelectedLocation] = useState(ALL);
  const [selectedTemplate, setSelectedTemplate] = useState(ALL);
  const enabled = !!profile?.company_id;

  const { data: submissions = [] } = useQuery({
    queryKey: ["compliance-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_submissions")
        .select("id, user_id, status, created_at, notes, attachments, duration_seconds, template_id, template_title");
      if (error) throw error;
      return data;
    },
    enabled,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["compliance-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("checklist_templates").select("id, title").eq("is_archived", false);
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

  const { data: userRoles = [] } = useQuery({
    queryKey: ["compliance-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, location_id");
      if (error) throw error;
      return data;
    },
    enabled,
  });

  // Lookup maps
  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach((p) => { m[p.user_id] = p.full_name || "Unknown"; });
    return m;
  }, [profiles]);

  const userLocationMap = useMemo(() => {
    const m: Record<string, string | null> = {};
    userRoles.forEach((r) => { m[r.user_id] = r.location_id; });
    return m;
  }, [userRoles]);

  const templateMap = useMemo(() => {
    const m: Record<string, string> = {};
    templates.forEach((t) => { m[t.id] = t.title; });
    return m;
  }, [templates]);

  const locationMap = useMemo(() => {
    const m: Record<string, string> = {};
    locations.forEach((l) => { m[l.id] = l.name; });
    return m;
  }, [locations]);

  // Filtered submissions (location + template + date)
  const filtered = useMemo(() => {
    let result = submissions;
    if (selectedLocation !== ALL) {
      result = result.filter((s) => userLocationMap[s.user_id] === selectedLocation);
    }
    if (selectedTemplate !== ALL) {
      result = result.filter((s) => s.template_id === selectedTemplate);
    }
    return result;
  }, [submissions, selectedLocation, selectedTemplate, userLocationMap]);

  // Summary stats
  const total = filtered.length;
  const approved = filtered.filter((s) => s.status === "approved").length;
  const pending = filtered.filter((s) => s.status === "pending").length;
  const rejected = filtered.filter((s) => s.status === "rejected").length;
  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  // Average completion time
  const avgCompletionTime = useMemo(() => {
    const withDuration = filtered.filter((s: any) => s.duration_seconds && s.duration_seconds > 0);
    if (withDuration.length === 0) return null;
    const avg = withDuration.reduce((sum: number, s: any) => sum + s.duration_seconds, 0) / withDuration.length;
    return Math.round(avg / 60);
  }, [filtered]);

  // Weekly rolling approval rate (12 weeks)
  const weeklyRateData = useMemo(() => {
    const now = new Date();
    const weeks: { week: string; rate: number; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(now, i));
      const weekEnd = endOfWeek(subWeeks(now, i));
      const weekSubs = filtered.filter((s) => {
        const d = new Date(s.created_at);
        return isWithinInterval(d, { start: weekStart, end: weekEnd });
      });
      const weekApproved = weekSubs.filter((s) => s.status === "approved").length;
      const rate = weekSubs.length > 0 ? Math.round((weekApproved / weekSubs.length) * 100) : 0;
      weeks.push({ week: format(weekStart, "MMM d"), rate, total: weekSubs.length });
    }
    return weeks;
  }, [filtered]);

  const weeklyChartConfig = {
    rate: { label: "Approval Rate %", color: "hsl(var(--primary))" },
  };

  // Avg completion time by location
  const locationTimeData = useMemo(() => {
    return locations.map((loc) => {
      const locSubs = filtered.filter((s: any) => userLocationMap[s.user_id] === loc.id && s.duration_seconds && s.duration_seconds > 0);
      if (locSubs.length === 0) return null;
      const avg = Math.round(locSubs.reduce((sum: number, s: any) => sum + s.duration_seconds, 0) / locSubs.length / 60);
      return { name: loc.name, avgMinutes: avg, count: locSubs.length };
    }).filter(Boolean) as { name: string; avgMinutes: number; count: number }[];
  }, [locations, filtered, userLocationMap]);

  const locationTimeChartConfig = {
    avgMinutes: { label: "Avg Minutes", color: "hsl(var(--primary))" },
  };

  // Submission trends (last 30 days)
  const trendData = useMemo(() => {
    const now = new Date();
    const days: { date: string; approved: number; pending: number; rejected: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = startOfDay(subDays(now, i));
      const dayStr = format(day, "yyyy-MM-dd");
      const label = format(day, "MMM d");
      const daySubmissions = filtered.filter((s) => format(new Date(s.created_at), "yyyy-MM-dd") === dayStr);
      days.push({
        date: label,
        approved: daySubmissions.filter((s) => s.status === "approved").length,
        pending: daySubmissions.filter((s) => s.status === "pending").length,
        rejected: daySubmissions.filter((s) => s.status === "rejected").length,
      });
    }
    return days;
  }, [filtered]);

  const trendChartConfig = {
    approved: { label: "Approved", color: "hsl(142 71% 45%)" },
    pending: { label: "Pending", color: "hsl(38 92% 50%)" },
    rejected: { label: "Rejected", color: "hsl(0 84% 60%)" },
  };

  // Approval rate by location
  const locationRateData = useMemo(() => {
    return locations.map((loc) => {
      const locSubs = filtered.filter((s) => userLocationMap[s.user_id] === loc.id);
      const locApproved = locSubs.filter((s) => s.status === "approved").length;
      const rate = locSubs.length > 0 ? Math.round((locApproved / locSubs.length) * 100) : 0;
      return { name: loc.name, rate, total: locSubs.length };
    }).filter((d) => d.total > 0).sort((a, b) => b.rate - a.rate);
  }, [locations, filtered, userLocationMap]);

  const locationChartConfig = {
    rate: { label: "Approval Rate %", color: "hsl(var(--primary))" },
  };

  // Status breakdown for donut
  const statusData = useMemo(() => [
    { name: "Approved", value: approved, color: "hsl(142 71% 45%)" },
    { name: "Pending", value: pending, color: "hsl(38 92% 50%)" },
    { name: "Rejected", value: rejected, color: "hsl(0 84% 60%)" },
  ].filter((d) => d.value > 0), [approved, pending, rejected]);

  // Overdue pending items (> 7 days)
  const overdueItems = useMemo(() => {
    const now = new Date();
    return filtered
      .filter((s) => s.status === "pending")
      .map((s) => ({
        id: s.id,
        userName: profileMap[s.user_id] || "Unknown",
        submittedAt: s.created_at,
        daysPending: differenceInDays(now, new Date(s.created_at)),
      }))
      .filter((s) => s.daysPending >= OVERDUE_DAYS)
      .sort((a, b) => b.daysPending - a.daysPending);
  }, [filtered, profileMap]);

  const exportCsv = useCallback(() => {
    const headers = ["Submitted Date", "User", "Template", "Status", "Location", "Duration (mins)", "Days Pending", "Notes", "Attachments"];
    const now = new Date();
    const rows = filtered.map((s) => {
      const locId = userLocationMap[s.user_id];
      const locName = locId ? locationMap[locId] ?? "" : "";
      const daysPending = s.status === "pending" ? differenceInDays(now, new Date(s.created_at)) : "";
      const durationMins = s.duration_seconds ? Math.round(s.duration_seconds / 60) : "";
      const attachCount = Array.isArray(s.attachments) ? (s.attachments as unknown[]).length : 0;
      return [
        format(new Date(s.created_at), "yyyy-MM-dd"),
        profileMap[s.user_id] || "Unknown",
        s.template_id ? (templateMap[s.template_id] || (s as any).template_title || "") : "",
        s.status,
        locName,
        durationMins,
        daysPending,
        (s.notes || "").replace(/"/g, '""'),
        attachCount,
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-report-${format(now, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, profileMap, userLocationMap, locationMap, templateMap]);

  const [activeTab, setActiveTab] = useState("compliance");
  const incidentExportRef = useRef<(() => void) | null>(null);


  return (
    <div className="space-y-6 print:space-y-4 min-w-0 overflow-hidden">
      {/* Header + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Compliance Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Submission trends, approval rates, and overdue items</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeTab === "compliance") exportCsv();
              else incidentExportRef.current?.();
            }}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" />
            Print PDF
          </Button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Select value={selectedLocation} onValueChange={setSelectedLocation}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Locations</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeTab === "compliance" && (
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="All Checklists" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Checklists</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(selectedLocation !== ALL || selectedTemplate !== ALL) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedLocation(ALL);
              setSelectedTemplate(ALL);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="compliance" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" /> Compliance
          </TabsTrigger>
          <TabsTrigger value="incidents" className="gap-1.5">
            <ShieldAlert className="h-4 w-4" /> Incidents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compliance" className="space-y-6 mt-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ClipboardCheck className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Total Submissions</p>
                <p className="text-xl sm:text-2xl font-bold tabular-nums">{total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Approval Rate</p>
                <p className="text-xl sm:text-2xl font-bold tabular-nums">{approvalRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Pending Review</p>
                <p className="text-xl sm:text-2xl font-bold tabular-nums">{pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Rejected</p>
                <p className="text-xl sm:text-2xl font-bold tabular-nums">{rejected}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Timer className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Avg Completion</p>
                <p className="text-xl sm:text-2xl font-bold tabular-nums">{avgCompletionTime !== null ? `${avgCompletionTime}m` : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Submission Trends */}
        <Card className="lg:col-span-2 min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Submission Trends (30 days)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <ChartContainer config={trendChartConfig} className="h-[250px] sm:h-[280px] w-full">
              <BarChart data={trendData} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={6} angle={-45} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="approved" stackId="a" fill="var(--color-approved)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" stackId="a" fill="var(--color-pending)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="rejected" stackId="a" fill="var(--color-rejected)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Status Breakdown Donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">By Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {statusData.length > 0 ? (
              <div className="w-full">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      stroke="none"
                    >
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-2">
                  {statusData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-medium tabular-nums">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-12">No submission data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approval Rate by Location */}
      {locationRateData.length > 0 && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Approval Rate by Location</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <ChartContainer config={locationChartConfig} className="h-[240px] w-full">
              <BarChart data={locationRateData} layout="vertical" margin={{ left: 0, right: 8 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="rate" fill="var(--color-rate)" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Weekly Approval Rate Trend */}
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Weekly Approval Rate (12 weeks)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-hidden">
          <ChartContainer config={weeklyChartConfig} className="h-[240px] w-full">
            <LineChart data={weeklyRateData} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
              <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="rate" stroke="var(--color-rate)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Avg Completion Time by Location */}
      {locationTimeData.length > 0 && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Avg Completion Time by Location</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <ChartContainer config={locationTimeChartConfig} className="h-[240px] w-full">
              <BarChart data={locationTimeData} layout="vertical" margin={{ left: 0, right: 8 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}m`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="avgMinutes" fill="var(--color-avgMinutes)" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <CardTitle className="text-base font-semibold">
              Overdue Pending Items ({overdueItems.length})
            </CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">Submissions pending review for {OVERDUE_DAYS}+ days</p>
        </CardHeader>
        <CardContent>
          {overdueItems.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Days Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdueItems.slice(0, 20).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.userName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(item.submittedAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={item.daysPending > 14 ? "destructive" : "secondary"}>
                        {item.daysPending}d
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">No overdue items — all caught up</p>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          <IncidentAnalyticsTab
            selectedLocation={selectedLocation}
            onExportCsvRef={(fn) => { incidentExportRef.current = fn; }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
