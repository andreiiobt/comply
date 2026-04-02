import { useState, useMemo } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingProvider";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckSquare, CheckCircle2, Clock, User, Settings, ClipboardList, AlertTriangle, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { format, addDays, startOfWeek, endOfWeek, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import NotificationBell from "@/components/NotificationBell";
import { useExpiryCheck } from "@/hooks/useExpiryCheck";

export default function AuditorHome() {
  useExpiryCheck();
  const { user, profile, primaryRole } = useAuth();
  const { company } = useBranding();
  const navigate = useNavigate();
  const todayDayIdx = (new Date().getDay() + 6) % 7;
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(todayDayIdx);

  const { data: submissions = [] } = useQuery({
    queryKey: ["my-submissions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_submissions")
        .select("template_id, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Today's submissions scoped to the company — uses proper UTC-aware timestamps
  // so users in non-UTC timezones (e.g. AEST UTC+10) get the right day window.
  // RLS scopes results to the company; admins/managers see all; staff see own rows.
  const { data: todayTeamSubs = [] } = useQuery({
    queryKey: ["today-team-submissions", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_submissions")
        .select("template_id")
        .gte("created_at", startOfDay(new Date()).toISOString())
        .lte("created_at", endOfDay(new Date()).toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  // Team-wide done IDs (works fully for admin/manager; for staff falls back to own rows)
  const todayDoneIds = useMemo(
    () => new Set((todayTeamSubs as any[]).map((s) => s.template_id).filter(Boolean)),
    [todayTeamSubs]
  );

  // Personal done IDs derived from local-timezone-aware date comparison —
  // used as a guaranteed fallback so the Done marker always matches the circle count
  const personalTodayDoneIds = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    return new Set(
      (submissions as any[])
        .filter((s) => format(new Date(s.created_at), "yyyy-MM-dd") === todayStr)
        .map((s) => s.template_id)
        .filter(Boolean)
    );
  }, [submissions]);

  // Fetch assignments for the current user (RLS handles filtering)
  const { data: assignments = [] } = useQuery({
    queryKey: ["my-checklist-assignments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.
      from("checklist_assignments").
      select("template_id, due_date, recurrence_type, recurrence_days, recurrence_time");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id
  });

  const assignedTemplateIds = useMemo(
    () => [...new Set(assignments.map((a: any) => a.template_id))],
    [assignments]
  );

  // Build a map of template_id -> earliest due_date
  const dueDateMap = useMemo(() => {
    const map: Record<string, string> = {};
    assignments.forEach((a: any) => {
      if (a.due_date) {
        if (!map[a.template_id] || new Date(a.due_date) < new Date(map[a.template_id])) {
          map[a.template_id] = a.due_date;
        }
      }
    });
    return map;
  }, [assignments]);

  // Fetch published templates that are assigned to user
  const { data: templates = [] } = useQuery({
    queryKey: ["assigned-templates", assignedTemplateIds],
    queryFn: async () => {
      if (assignedTemplateIds.length === 0) {
        // Fallback: show all published templates if no assignments exist
        const { data, error } = await supabase.
        from("checklist_templates").
        select("*").
        eq("is_published", true).
        eq("is_archived", false);
        if (error) throw error;
        return data || [];
      }
      const { data, error } = await supabase.
      from("checklist_templates").
      select("*").
      eq("is_published", true).
      eq("is_archived", false).
      in("id", assignedTemplateIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id
  });

  // Weekly activity data
  const weekActivity = useMemo(() => {
    const now = new Date();
    const ws = startOfWeek(now, { weekStartsOn: 1 });
    const we = endOfWeek(now, { weekStartsOn: 1 });
    const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];
    const counts = Array(7).fill(0);
    const todayIdx = (now.getDay() + 6) % 7; // Mon=0

    submissions.forEach((s) => {
      const d = new Date(s.created_at);
      if (isWithinInterval(d, { start: ws, end: we })) {
        const idx = (d.getDay() + 6) % 7;
        counts[idx]++;
      }
    });

    // Per-day due templates (personal assignments)
    const perDayDue: { id: string; title: string; completedThatDay: boolean }[][] = Array.from({ length: 7 }, () => []);
    for (let i = 0; i < 7; i++) {
      const target = addDays(ws, i);
      const dow = target.getDay();
      const dom = target.getDate();
      const targetStr = format(target, "yyyy-MM-dd");

      const dueIds = new Set<string>();
      assignments.forEach((a: any) => {
        const rt = a.recurrence_type || "none";
        if (rt === "daily") dueIds.add(a.template_id);
        else if (rt === "weekly" && Array.isArray(a.recurrence_days) && a.recurrence_days.includes(dow)) dueIds.add(a.template_id);
        else if (rt === "monthly" && Array.isArray(a.recurrence_days) && a.recurrence_days.includes(dom)) dueIds.add(a.template_id);
      });
      Object.entries(dueDateMap).forEach(([tid, dd]) => {
        if (format(new Date(dd), "yyyy-MM-dd") === targetStr) dueIds.add(tid);
      });

      const submittedThatDay = new Set(
        submissions
          .filter((s) => format(new Date(s.created_at), "yyyy-MM-dd") === targetStr)
          .map((s: any) => s.template_id)
          .filter(Boolean)
      );

      perDayDue[i] = templates
        .filter((t: any) => dueIds.has(t.id))
        .map((t: any) => ({ id: t.id, title: t.title, completedThatDay: submittedThatDay.has(t.id) }));
    }

    return { dayLabels, counts, todayIdx, perDayDue, weekStart: ws };
  }, [submissions, assignments, templates, dueDateMap]);

  const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-display font-bold truncate">{company?.name || "Comply"}</h1>
          <div className="flex items-center gap-1">
            {(primaryRole === "admin" || primaryRole === "manager") &&
            <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(primaryRole === "admin" ? "/admin/dashboard" : "/manager/dashboard")}>
                <Settings className="h-5 w-5" />
              </Button>
            }
            <NotificationBell />
            <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate("/profile")}>
              <User className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Greeting */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
          <h2 className="text-2xl font-display font-bold">
            Hi, {profile?.full_name?.split(" ")[0] || "there"} 👋
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Your morning check-in at a glance.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              size="sm"
              className="rounded-xl gap-1.5"
              onClick={() => navigate("/my-checklists")}>
              <ClipboardList className="h-3.5 w-3.5" />
              Checklists
            </Button>
            <Button
              size="sm"
              className="rounded-xl gap-1.5"
              onClick={() => navigate("/my-submissions")}>
              <CheckSquare className="h-3.5 w-3.5" />
              Submissions
            </Button>
            {(primaryRole === "admin" || primaryRole === "manager") && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl gap-1.5"
                onClick={() => navigate(`/${primaryRole}/report-incident`)}>
                <AlertTriangle className="h-3.5 w-3.5" />
                Report Incident
              </Button>
            )}
          </div>
        </motion.div>

        {/* Activity Calendar with inline day detail */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.5, ease }}>
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-primary" />
                Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {/* Day-of-week row */}
              <div className="grid grid-cols-7 gap-1">
                {weekActivity.dayLabels.map((label, i) => {
                  const isToday = i === weekActivity.todayIdx;
                  const isSelected = selectedDayIdx === i;
                  const count = weekActivity.counts[i];
                  const hasDue = weekActivity.perDayDue[i].length > 0;
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDayIdx(isSelected ? null : i)}
                      className="flex flex-col items-center gap-1.5 group">

                      <div
                        className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold transition-all",
                          isSelected ?
                          "ring-2 ring-primary ring-offset-2 ring-offset-background" :
                          "",
                          isToday ?
                          "bg-primary text-primary-foreground" :
                          "bg-muted text-muted-foreground",
                          "active:scale-95"
                        )}>

                        {label}
                      </div>
                      {hasDue &&
                      <span className={cn("w-1 h-1 rounded-full", isToday ? "bg-primary" : "bg-muted-foreground/40")} />
                      }
                    </button>);

                })}
              </div>

              {/* Selected day detail */}
              {selectedDayIdx !== null && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="border-t pt-3"
                >
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {format(addDays(weekActivity.weekStart, selectedDayIdx), "EEEE, MMM d")}
                    {selectedDayIdx === weekActivity.todayIdx && (
                      <span className="text-primary ml-1">· Today</span>
                    )}
                  </p>
                  {weekActivity.perDayDue[selectedDayIdx].length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">Nothing scheduled this day.</p>
                  ) : (
                    <div className="space-y-1">
                      {weekActivity.perDayDue[selectedDayIdx].map((tpl) => {
                        // For today: team-wide check (admin/manager see all) with
                        // personal fallback so own submissions always show as Done
                        const isDone =
                          selectedDayIdx === weekActivity.todayIdx
                            ? todayDoneIds.has(tpl.id) || personalTodayDoneIds.has(tpl.id)
                            : tpl.completedThatDay;
                        const isFuture = selectedDayIdx > weekActivity.todayIdx;
                        return (
                          <div key={tpl.id} className="flex items-center gap-2 py-2 border-b last:border-0">
                            {isDone ? (
                              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            ) : (
                              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <p className={cn(
                              "text-sm font-display font-semibold truncate flex-1",
                              isDone && "text-muted-foreground line-through"
                            )}>
                              {tpl.title}
                            </p>
                            {isDone && (
                              <span className="text-[10px] text-primary font-medium shrink-0">Done</span>
                            )}
                            {!isDone && isFuture && (
                              <span className="text-[10px] text-muted-foreground shrink-0">Scheduled</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}