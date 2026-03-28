import { useState, useMemo } from "react";
import { itemText } from "@/lib/checklist-utils";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ClipboardList, Play, Search, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { motion } from "framer-motion";

export default function MyChecklists() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const { data: assignments = [] } = useQuery({
    queryKey: ["my-checklist-assignments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_assignments")
        .select("template_id, due_date, recurrence_type, recurrence_days, recurrence_time");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const assignedTemplateIds = useMemo(
    () => [...new Set(assignments.map((a: any) => a.template_id))],
    [assignments]
  );

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

  const { data: templates = [] } = useQuery({
    queryKey: ["assigned-templates", assignedTemplateIds],
    queryFn: async () => {
      if (assignedTemplateIds.length === 0) return [];
      const { data, error } = await supabase
        .from("checklist_templates")
        .select("*")
        .eq("is_published", true)
        .eq("is_archived", false)
        .in("id", assignedTemplateIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  const { data: approvedSubs = [] } = useQuery({
    queryKey: ["my-approved-subs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_submissions")
        .select("template_id")
        .eq("user_id", user!.id)
        .eq("status", "approved");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const categories = useMemo(() => {
    const cats = templates.map((t: any) => t.category).filter(Boolean);
    return [...new Set(cats)] as string[];
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    let result = templates;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((t: any) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
    }
    if (categoryFilter) {
      result = result.filter((t: any) => t.category === categoryFilter);
    }
    const now = new Date();
    result = [...result].sort((a: any, b: any) => {
      const dueDateA = dueDateMap[a.id];
      const dueDateB = dueDateMap[b.id];
      const hasApprovedA = approvedSubs.some((s: any) => s.template_id === a.id);
      const hasApprovedB = approvedSubs.some((s: any) => s.template_id === b.id);
      const overdueA = dueDateA && new Date(dueDateA) < now && !hasApprovedA;
      const overdueB = dueDateB && new Date(dueDateB) < now && !hasApprovedB;
      if (overdueA && !overdueB) return -1;
      if (!overdueA && overdueB) return 1;
      if (dueDateA && dueDateB) return new Date(dueDateA).getTime() - new Date(dueDateB).getTime();
      if (dueDateA) return -1;
      if (dueDateB) return 1;
      return 0;
    });
    return result;
  }, [templates, search, categoryFilter, dueDateMap, approvedSubs]);

  const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={() => navigate("/home")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-display font-bold">Available Checklists</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search checklists…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl h-10 text-sm"
            />
          </div>

          {/* Category chips */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              <button
                onClick={() => setCategoryFilter(null)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  !categoryFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    categoryFilter === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Template list */}
          {filteredTemplates.length === 0 ? (
            <div className="py-12 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search || categoryFilter ? "No matching checklists found." : "No checklists assigned yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {filteredTemplates.map((tpl: any, i: number) => {
                const items = Array.isArray(tpl.items) ? tpl.items.map(itemText) : [];
                const dueDate = dueDateMap[tpl.id];
                const isOverdue = dueDate && new Date(dueDate) < new Date() && !approvedSubs.some((s: any) => s.template_id === tpl.id);
                return (
                  <motion.div
                    key={tpl.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 * i, duration: 0.4, ease }}
                    className="flex items-center justify-between py-3 border-b last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-display font-semibold truncate">{tpl.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs text-muted-foreground">{items.length} items</p>
                        {tpl.category && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5">{tpl.category}</Badge>
                        )}
                        {dueDate && (
                          <span className={cn("text-[10px] font-medium", isOverdue ? "text-destructive" : "text-muted-foreground")}>
                            {isOverdue ? "Overdue · " : "Due "}
                            {format(new Date(dueDate), "MMM d")}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="rounded-xl gap-1 shrink-0"
                      onClick={() => navigate(`/checklist/${tpl.id}`)}
                    >
                      <Play className="h-3.5 w-3.5" /> Start
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
