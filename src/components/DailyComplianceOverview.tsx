import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import WeeklyTrendChart from "@/components/WeeklyTrendChart";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CalendarIcon, CheckCircle2, XCircle, MapPin, Clock, User } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  locationIds: string[];
}

function isDueOnDate(
  assignment: { recurrence_type: string; recurrence_days: number[] | null; due_date: string | null },
  date: Date
): boolean {
  const rt = assignment.recurrence_type || "none";
  const dow = date.getDay();
  const dom = date.getDate();
  const dateStr = format(date, "yyyy-MM-dd");

  if (rt === "daily") return true;
  if (rt === "weekly" && Array.isArray(assignment.recurrence_days) && assignment.recurrence_days.includes(dow)) return true;
  if (rt === "monthly" && Array.isArray(assignment.recurrence_days) && assignment.recurrence_days.includes(dom)) return true;
  if (rt === "none" && assignment.due_date && format(new Date(assignment.due_date), "yyyy-MM-dd") === dateStr) return true;
  return false;
}

export default function DailyComplianceOverview({ locationIds }: Props) {
  const { profile } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filterLocationId, setFilterLocationId] = useState("all");

  // Fetch locations
  const { data: locations = [], isLoading: locationsLoading, isError: locationsError } = useQuery({
    queryKey: ["locations", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  const visibleLocations = useMemo(() => {
    return locations.filter((l) => locationIds.includes(l.id));
  }, [locations, locationIds]);

  // Fetch all assignments
  const { data: assignments = [], isLoading: assignmentsLoading, isError: assignmentsError } = useQuery({
    queryKey: ["all-checklist-assignments", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_assignments")
        .select("id, template_id, assign_type, assign_value, recurrence_type, recurrence_days, due_date, is_active")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  // Fetch templates
  const { data: templates = [], isLoading: templatesLoading, isError: templatesError } = useQuery({
    queryKey: ["all-checklist-templates", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_templates")
        .select("id, title, category")
        .eq("is_archived", false);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  // Fetch user_roles to map users to locations
  const { data: userRoles = [], isLoading: userRolesLoading } = useQuery({
    queryKey: ["user-roles-locations", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, location_id");
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  // Map user_id → location_ids
  const userLocationMap = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    userRoles.forEach((ur) => {
      if (ur.location_id) {
        if (!m[ur.user_id]) m[ur.user_id] = new Set();
        m[ur.user_id].add(ur.location_id);
      }
    });
    return m;
  }, [userRoles]);

  // Fetch submissions for selected date
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const { data: submissions = [], isLoading: submissionsLoading, isError: submissionsError } = useQuery({
    queryKey: ["daily-submissions", dateStr, profile?.company_id],
    queryFn: async () => {
      const dayStart = startOfDay(selectedDate).toISOString();
      const dayEnd = endOfDay(selectedDate).toISOString();
      const { data, error } = await supabase
        .from("checklist_submissions")
        .select("id, template_id, user_id, completed_at, created_at, status")
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  // Fetch profiles for user names
  const { data: profiles = [] } = useQuery({
    queryKey: ["company-profiles", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("company_id", profile!.company_id!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach((p) => { m[p.user_id] = p.full_name || "Unknown"; });
    return m;
  }, [profiles]);

  const templateMap = useMemo(() => {
    const m: Record<string, { title: string; category: string | null }> = {};
    templates.forEach((t) => { m[t.id] = { title: t.title, category: t.category }; });
    return m;
  }, [templates]);

  // Compute per-location compliance data
  const complianceData = useMemo(() => {
    const filteredLocs = filterLocationId === "all"
      ? visibleLocations
      : visibleLocations.filter((l) => l.id === filterLocationId);

    return filteredLocs.map((loc) => {
      // Find assignments for this location that are due on selected date
      // Include both location-specific AND company-wide ("all") assignments
      const locAssignments = assignments.filter(
        (a) =>
          isDueOnDate(a as any, selectedDate) &&
          (
            a.assign_type === "all" ||
            a.assign_type === "custom_role" ||
            a.assign_type === "role" ||
            (a.assign_type === "location" && a.assign_value === loc.id)
          )
      );

      // Unique template IDs due
      const dueTemplateIds = [...new Set(locAssignments.map((a) => a.template_id))];

      // Find submissions matching these templates — scoped to users at THIS location
      const templateResults = dueTemplateIds.map((tid) => {
        const sub = submissions.find(
          (s) => s.template_id === tid && userLocationMap[s.user_id]?.has(loc.id)
        );
        return {
          templateId: tid,
          title: templateMap[tid]?.title || "Unknown",
          category: templateMap[tid]?.category,
          completed: !!sub,
          completedBy: sub ? profileMap[sub.user_id] : null,
          completedAt: sub?.completed_at || sub?.created_at || null,
        };
      });

      const completedCount = templateResults.filter((t) => t.completed).length;
      return {
        locationId: loc.id,
        locationName: loc.name,
        templates: templateResults,
        completedCount,
        totalCount: templateResults.length,
      };
    });
  }, [visibleLocations, assignments, submissions, selectedDate, templateMap, profileMap, filterLocationId, userLocationMap]);

  const totalCompleted = complianceData.reduce((s, l) => s + l.completedCount, 0);
  const totalDue = complianceData.reduce((s, l) => s + l.totalCount, 0);
  const completionRate = totalDue > 0 ? Math.round((totalCompleted / totalDue) * 100) : 0;

  const isInitialLoading = locationsLoading || assignmentsLoading || templatesLoading || userRolesLoading;
  const hasError = locationsError || assignmentsError || templatesError || submissionsError;

  // Skeleton shown while the foundational data loads (locations, assignments, templates)
  if (isInitialLoading) {
    return (
      <div className="space-y-6">
        {/* Header controls skeleton */}
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-44 rounded-md" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="rounded-2xl">
              <CardContent className="p-4 text-center space-y-2">
                <Skeleton className="h-7 w-12 mx-auto rounded" />
                <Skeleton className="h-3 w-16 mx-auto rounded" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Progress bar skeleton */}
        <Skeleton className="h-2 w-full rounded-full" />

        {/* Chart skeleton */}
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <Skeleton className="h-32 w-full rounded" />
          </CardContent>
        </Card>

        {/* Location card skeletons */}
        {[0, 1].map((i) => (
          <Card key={i} className="rounded-2xl">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-32 rounded" />
                </div>
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {[0, 1, 2].map((j) => (
                <div key={j} className="flex items-center gap-2 py-1">
                  <Skeleton className="h-4 w-4 rounded-full shrink-0" />
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-3.5 w-48 rounded" />
                    <Skeleton className="h-3 w-32 rounded" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Error state shown if any critical query fails
  if (hasError) {
    return (
      <div className="space-y-6">
        {/* Keep controls visible so user can retry by changing date */}
        <div className="flex flex-wrap items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {format(selectedDate, "PPP")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                disabled={(d) => d > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        <Card className="rounded-2xl border-destructive/30">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Couldn't load compliance data</p>
            <p className="text-xs text-muted-foreground">Check your connection and refresh the page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {format(selectedDate, "PPP")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              disabled={(d) => d > new Date()}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        {visibleLocations.length > 1 && (
          <Select value={filterLocationId} onValueChange={setFilterLocationId}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {visibleLocations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="rounded-2xl">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-display font-bold tabular-nums">{totalCompleted}/{totalDue}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-display font-bold tabular-nums">{completionRate}%</p>
            <p className="text-xs text-muted-foreground">Completion Rate</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-display font-bold tabular-nums text-destructive">{totalDue - totalCompleted}</p>
            <p className="text-xs text-muted-foreground">Missed</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      {totalDue > 0 && (
        <Progress value={completionRate} className="h-2 rounded-full" />
      )}

      {/* 7-day trend chart */}
      <WeeklyTrendChart locationIds={locationIds} assignments={assignments} />

      {/* Per-location cards — show skeleton rows while submissions are fetching on date change */}
      {submissionsLoading ? (
        <>
          {[0, 1].map((i) => (
            <Card key={i} className="rounded-2xl">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-32 rounded" />
                  </div>
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="flex items-center gap-2 py-1">
                    <Skeleton className="h-4 w-4 rounded-full shrink-0" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-3.5 w-48 rounded" />
                      <Skeleton className="h-3 w-32 rounded" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </>
      ) : complianceData.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="p-8 text-center text-muted-foreground">
            No locations to display.
          </CardContent>
        </Card>
      ) : (
        complianceData.map((loc) => (
          <Card key={loc.locationId} className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {loc.locationName}
                </span>
                <Badge
                  variant={loc.completedCount === loc.totalCount && loc.totalCount > 0 ? "default" : "outline"}
                  className={cn(
                    "text-xs",
                    loc.totalCount === 0 && "text-muted-foreground",
                    loc.completedCount === loc.totalCount && loc.totalCount > 0 && "bg-primary"
                  )}
                >
                  {loc.completedCount}/{loc.totalCount}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {loc.templates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No checklists were due this day.</p>
              ) : (
                <div className="divide-y">
                  {loc.templates.map((t) => (
                    <div key={t.templateId} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {t.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{t.title}</p>
                          {t.completed && t.completedBy && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {t.completedBy}
                              {t.completedAt && (
                                <>
                                  <Clock className="h-3 w-3 ml-1" />
                                  {format(new Date(t.completedAt), "h:mm a")}
                                </>
                              )}
                            </p>
                          )}
                          {!t.completed && (
                            <p className="text-xs text-destructive">Missed</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
