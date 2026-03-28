import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { TrendingUp } from "lucide-react";

interface Props {
  locationIds: string[];
  assignments: {
    id: string;
    template_id: string;
    assign_type: string;
    assign_value: string | null;
    recurrence_type: string;
    recurrence_days: number[] | null;
    due_date: string | null;
  }[];
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

export default function WeeklyTrendChart({ locationIds, assignments }: Props) {
  const { profile } = useAuth();

  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));
  }, []);

  const rangeStart = startOfDay(days[0]).toISOString();
  const rangeEnd = endOfDay(days[6]).toISOString();

  // Fetch only approved/pending submissions for the week
  const { data: weekSubmissions = [] } = useQuery({
    queryKey: ["weekly-submissions", rangeStart, rangeEnd, profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_submissions")
        .select("id, template_id, user_id, created_at")
        .gte("created_at", rangeStart)
        .lte("created_at", rangeEnd)
        .in("status", ["approved", "pending"]);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  // Fetch user_roles to scope submissions to locations
  const { data: userRoles = [] } = useQuery({
    queryKey: ["user-roles-locations-chart", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, location_id");
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

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

  const chartData = useMemo(() => {
    return days.map((day) => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      let totalDue = 0;
      let totalCompleted = 0;

      for (const locId of locationIds) {
        // Include both location-specific AND company-wide ("all") assignments
        const locAssignments = assignments.filter(
          (a) =>
            isDueOnDate(a, day) &&
            (a.assign_type === "all" || (a.assign_type === "location" && a.assign_value === locId))
        );
        const dueTemplateIds = [...new Set(locAssignments.map((a) => a.template_id))];
        totalDue += dueTemplateIds.length;

        // Scope submissions to users at this location
        const daySubs = weekSubmissions.filter((s) => {
          const created = new Date(s.created_at);
          return created >= dayStart && created <= dayEnd && userLocationMap[s.user_id]?.has(locId);
        });

        for (const tid of dueTemplateIds) {
          if (daySubs.some((s) => s.template_id === tid)) {
            totalCompleted++;
          }
        }
      }

      const rate = totalDue > 0 ? Math.round((totalCompleted / totalDue) * 100) : 0;

      return {
        date: format(day, "EEE"),
        fullDate: format(day, "MMM d"),
        rate,
        completed: totalCompleted,
        due: totalDue,
      };
    });
  }, [days, locationIds, assignments, weekSubmissions, userLocationMap]);

  const avgRate = useMemo(() => {
    const withData = chartData.filter((d) => d.due > 0);
    if (withData.length === 0) return 0;
    return Math.round(withData.reduce((s, d) => s + d.rate, 0) / withData.length);
  }, [chartData]);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-display flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            7-Day Completion Trend
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            Avg: {avgRate}%
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="completionGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-card p-2  text-sm">
                      <p className="font-semibold">{d.fullDate}</p>
                      <p className="text-muted-foreground">
                        {d.completed}/{d.due} completed ({d.rate}%)
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="rate"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#completionGradient)"
                dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "hsl(var(--background))" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
