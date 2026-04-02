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
import {
  ClipboardCheck, CheckCircle2, Clock, XCircle, AlertTriangle,
  Download, Printer, Timer, ShieldAlert,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import IncidentAnalyticsTab from "@/components/IncidentAnalyticsTab";
import {
  format, subDays, differenceInDays, startOfDay,
  subWeeks, startOfWeek, endOfWeek, isWithinInterval,
} from "date-fns";

const ALL = "__all__";
const OVERDUE_DAYS = 7;

export default function ManagerReports() {
  const { roles } = useAuth();
  const managerLocationId = roles.find((r) => r.role === "manager")?.location_id;

  const [selectedStaff, setSelectedStaff] = useState(ALL);
  const [selectedTemplate, setSelectedTemplate] = useState(ALL);
  const [activeTab, setActiveTab] = useState("compliance");
  const incidentExportRef = useRef<(() => void) | null>(null);

  const enabled = !!managerLocationId;

  // ── Staff user IDs at this location ─────────────────────────────────────────
  const { data: staffRoles = [] } = useQuery({
    queryKey: ["manager-reports-staff-roles", managerLocationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("location_id", managerLocationId!)
        .eq("role", "staff");
      return (data || []) as { user_id: string }[];
    },
    enabled,
  });

  const staffIds = useMemo(() => staffRoles.map((r) => r.user_id), [staffRoles]);

  const { data: staffProfiles = [] } = useQuery({
    queryKey: ["manager-reports-profiles", staffIds],
    queryFn: async () => {
      if (!staffIds.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", staffIds);
      return (data || []) as { user_id: string; full_name: string | null }[];
    },
    enabled: staffIds.length > 0,
  });

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    staffProfiles.forEach((p) => { m[p.user_id] = p.full_name || "Unknown"; });
    return m;
  }, [staffProfiles]);

  // ── Submissions scoped to location staff ─────────────────────────────────────
  const { data: submissions = [] } = useQuery({
    queryKey: ["manager-reports-submissions", staffIds],
    queryFn: async () => {
      if (!staffIds.length) return [];
      const { data } = await supabase
        .from("checklist_submissions")
        .select("id, user_id, status, created_at, notes, attachments, duration_seconds, template_id, template_title")
        .in("user_id", staffIds);
      return (data || []) as any[];
    },
    enabled: staffIds.length > 0,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["manager-reports-templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("checklist_templates")
        .select("id, title")
        .eq("is_archived", false);
      return (data || []) as { id: string; title: string }[];
    },
    enabled,
  });

  const templateMap = useMemo(() => {
    const m: Record<string, string> = {};
    templates.forEach((t) => { m[t.id] = t.title; });
    return m;
  }, [templates]);

  // ── Filtered view ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = submissions;
    if (selectedStaff !== ALL) result = result.filter((s) => s.user_id === selectedStaff);
    if (selectedTemplate !== ALL) result = result.filter((s) => s.template_id === selectedTemplate);
    return result;
  }, [submissions, selectedStaff, selectedTemplate]);

  // ── Summary stats ─────────────────────────────────────────────────────────────
  const total = filtered.length;
  const approved = filtered.filter((s) => s.status === "approved").length;
  const pending = filtered.filter((s) => s.status === "pending").length;
  const rejected = filtered.filter((s) => s.status === "rejected").length;
  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  const avgCompletionTime = useMemo(() => {
    const withDuration = filtered.filter((s: any) => s.duration_seconds && s.duration_seconds > 0);
    if (!withDuration.length) return null;
    const avg = withDuration.reduce((sum: number, s: any) => sum + s.duration_seconds, 0) / withDuration.length;
    return Math.round(avg / 60);
  }, [filtered]);

  // ── Charts ───────────────────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 30 }, (_, i) => {
      const day = startOfDay(subDays(now, 29 - i));
      const dayStr = format(day, "yyyy-MM-dd");
      const daySubs = filtered.filter((s) => format(new Date(s.created_at), "yyyy-MM-dd") === dayStr);
      return {
        date: format(day, "MMM d"),
        approved: daySubs.filter((s) => s.status === "approved").length,
        pending: daySubs.filter((s) => s.status === "pending").length,
        rejected: daySubs.filter((s) => s.status === "rejected").length,
      };
    });
  }, [filtered]);

  const trendChartConfig = {
    approved: { label: "Approved", color: "hsl(142 71% 45%)" },
    pending: { label: "Pending", color: "hsl(38 92% 50%)" },
    rejected: { label: "Rejected", color: "hsl(0 84% 60%)" },
  };

  const statusData = useMemo(() => [
    { name: "Approved", value: approved, color: "hsl(142 71% 45%)" },
    { name: "Pending", value: pending, color: "hsl(38 92% 50%)" },
    { name: "Rejected", value: rejected, color: "hsl(0 84% 60%)" },
  ].filter((d) => d.value > 0), [approved, pending, rejected]);

  const weeklyRateData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const weekStart = startOfWeek(subWeeks(now, 11 - i));
      const weekEnd = endOfWeek(subWeeks(now, 11 - i));
      const weekSubs = filtered.filter((s) =>
        isWithinInterval(new Date(s.created_at), { start: weekStart, end: weekEnd })
      );
      const weekApproved = weekSubs.filter((s) => s.status === "approved").length;
      return {
        week: format(weekStart, "MMM d"),
        rate: weekSubs.length > 0 ? Math.round((weekApproved / weekSubs.length) * 100) : 0,
        total: weekSubs.length,
      };
    });
  }, [filtered]);

  const weeklyChartConfig = { rate: { label: "Approval Rate %", color: "hsl(var(--primary))" } };

  const staffRateData = useMemo(() =>
    staffProfiles
      .map((p) => {
        const subs = filtered.filter((s) => s.user_id === p.user_id);
        if (!subs.length) return null;
        const rate = Math.round((subs.filter((s) => s.status === "approved").length / subs.length) * 100);
        return { name: p.full_name || "Unknown", rate, total: subs.length };
      })
      .filter(Boolean)
      .sort((a, b) => b!.rate - a!.rate) as { name: string; rate: number; total: number }[],
  [staffProfiles, filtered]);

  const staffTimeData = useMemo(() =>
    staffProfiles
      .map((p) => {
        const subs = filtered.filter((s) => s.user_id === p.user_id && s.duration_seconds > 0);
        if (!subs.length) return null;
        const avg = Math.round(subs.reduce((sum: number, s: any) => sum + s.duration_seconds, 0) / subs.length / 60);
        return { name: p.full_name || "Unknown", avgMinutes: avg };
      })
      .filter(Boolean) as { name: string; avgMinutes: number }[],
  [staffProfiles, filtered]);

  const staffChartConfig = { rate: { label: "Approval Rate %", color: "hsl(var(--primary))" } };
  const staffTimeChartConfig = { avgMinutes: { label: "Avg Minutes", color: "hsl(var(--primary))" } };

  const overdueItems = useMemo(() => {
    const now = new Date();
    return filtered
      .filter((s) => s.status === "pending")
      .map((s) => ({
        id: s.id,
        userName: profileMap[s.user_id] || "Unknown",
        templateTitle: s.template_id ? (templateMap[s.template_id] || s.template_title || "Checklist") : "Checklist",
        submittedAt: s.created_at,
        daysPending: differenceInDays(now, new Date(s.created_at)),
      }))
      .filter((s) => s.daysPending >= OVERDUE_DAYS)
      .sort((a, b) => b.daysPending - a.daysPending);
  }, [filtered, profileMap, templateMap]);

  const exportCsv = useCallback(() => {
    const headers = ["Submitted Date", "Staff", "Template", "Status", "Duration (mins)", "Days Pending", "Notes"];
    const now = new Date();
    const rows = filtered.map((s) => [
      format(new Date(s.created_at), "yyyy-MM-dd"),
      profileMap[s.user_id] || "Unknown",
      s.template_id ? (templateMap[s.template_id] || s.template_title || "") : "",
      s.status,
      s.duration_seconds ? Math.round(s.duration_seconds / 60) : "",
      s.status === "pending" ? differenceInDays(now, new Date(s.created_at)) : "",
      (s.notes || "").replace(/"/g, '""'),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `location-report-${format(now, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, profileMap, templateMap]);

  return (
    <div className="space-y-6 min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Compliance and incident analytics for your location</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { if (activeTab === "compliance") exportCsv(); else incidentExportRef.current?.(); }}
          >
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" /> Print PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {activeTab === "compliance" && (
          <>
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Staff</SelectItem>
                {staffProfiles.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.full_name || "Unknown"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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

            {(selectedStaff !== ALL || selectedTemplate !== ALL) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedStaff(ALL); setSelectedTemplate(ALL); }}
              >
                Clear filters
              </Button>
            )}
          </>
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
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            {[
              { icon: ClipboardCheck, color: "text-primary", bg: "bg-primary/10", label: "Total Submissions", value: total },
              { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-500/10", label: "Approval Rate", value: `${approvalRate}%` },
              { icon: Clock, color: "text-amber-600", bg: "bg-amber-500/10", label: "Pending Review", value: pending },
              { icon: XCircle, color: "text-red-600", bg: "bg-red-500/10", label: "Rejected", value: rejected },
              { icon: Timer, color: "text-primary", bg: "bg-primary/10", label: "Avg Completion", value: avgCompletionTime !== null ? `${avgCompletionTime}m` : "—" },
            ].map(({ icon: Icon, color, bg, label, value }) => (
              <Card key={label}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">{label}</p>
                      <p className="text-xl sm:text-2xl font-bold tabular-nums">{value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Trends + Donut */}
          <div className="grid gap-6 lg:grid-cols-3">
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
                    <Bar dataKey="approved" stackId="a" fill="var(--color-approved)" />
                    <Bar dataKey="pending" stackId="a" fill="var(--color-pending)" />
                    <Bar dataKey="rejected" stackId="a" fill="var(--color-rejected)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">By Status</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                {statusData.length > 0 ? (
                  <div className="w-full">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                          {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
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
                  <p className="text-sm text-muted-foreground py-12">No data yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Approval Rate by Staff — only if multiple staff have submissions */}
          {staffRateData.length > 1 && (
            <Card className="min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Approval Rate by Staff Member</CardTitle>
              </CardHeader>
              <CardContent className="overflow-hidden">
                <ChartContainer config={staffChartConfig} className="h-[240px] w-full">
                  <BarChart data={staffRateData} layout="vertical" margin={{ left: 0, right: 8 }}>
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="rate" fill="var(--color-rate)" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Weekly Approval Rate */}
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

          {/* Avg Completion Time by Staff — only if multiple staff have timed submissions */}
          {staffTimeData.length > 1 && (
            <Card className="min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Avg Completion Time by Staff Member</CardTitle>
              </CardHeader>
              <CardContent className="overflow-hidden">
                <ChartContainer config={staffTimeChartConfig} className="h-[240px] w-full">
                  <BarChart data={staffTimeData} layout="vertical" margin={{ left: 0, right: 8 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}m`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="avgMinutes" fill="var(--color-avgMinutes)" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Overdue Items */}
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
                      <TableHead>Staff</TableHead>
                      <TableHead>Checklist</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Days Pending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdueItems.slice(0, 20).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.userName}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{item.templateTitle}</TableCell>
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
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No overdue items — all caught up
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          <IncidentAnalyticsTab
            selectedLocation={managerLocationId || ALL}
            onExportCsvRef={(fn) => { incidentExportRef.current = fn; }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
