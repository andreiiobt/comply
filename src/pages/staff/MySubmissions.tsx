import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, CheckCircle2, Clock, XCircle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { motion } from "framer-motion";

export default function MySubmissions() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["my-submissions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_submissions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const templateIds = [...new Set(submissions.map((s: any) => s.template_id).filter(Boolean))];
  const { data: templateMap = {} } = useQuery({
    queryKey: ["template-titles", templateIds],
    queryFn: async () => {
      if (!templateIds.length) return {};
      const { data } = await supabase.from("checklist_templates").select("id, title").in("id", templateIds);
      const map: Record<string, string> = {};
      (data || []).forEach((t) => { map[t.id] = t.title; });
      return map;
    },
    enabled: templateIds.length > 0,
  });

  const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={() => navigate("/home")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-display font-bold">Recent Submissions</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : submissions.length === 0 ? (
          <div className="py-16 text-center">
            <CheckSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
          </div>
        ) : (
          <div className="space-y-0">
            {submissions.map((sub, i) => {
              const tplTitle = (sub as any).template_id ? ((templateMap as any)[(sub as any).template_id] || (sub as any).template_title) : (sub as any).template_title || null;
              return (
                <motion.button
                  key={sub.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.03 * Math.min(i, 10), duration: 0.4, ease }}
                  onClick={() => navigate(`/submission/${sub.id}`)}
                  className="flex items-center justify-between w-full py-3 border-b last:border-0 text-left hover:bg-muted/50 rounded-lg transition-colors active:scale-[0.98] px-2 -mx-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {sub.status === "approved" && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    {sub.status === "pending" && <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
                    {sub.status === "rejected" && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                    <span className="text-sm tabular-nums">{format(new Date(sub.created_at), "MMM d, yyyy")}</span>
                    {tplTitle && <span className="text-xs text-muted-foreground truncate">· {tplTitle}</span>}
                  </div>
                  <Badge
                    variant={sub.status === "approved" ? "default" : sub.status === "rejected" ? "destructive" : "secondary"}
                    className="rounded-lg text-xs capitalize shrink-0"
                  >
                    {sub.status}
                  </Badge>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
