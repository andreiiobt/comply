import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Info, AlertTriangle, CheckCircle2, XCircle, Bell, ArrowLeft, CheckSquare } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  user_id: string;
  company_id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  link?: string;
  status: "unread" | "read";
  created_at: string;
}

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["notifications-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown) as Notification[];
    },
    enabled: !!user,
  });

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications" as any)
        .update({ status: "read" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-full"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const getIcon = (type: string) => {
    switch (type) {
      case "success": return <CheckCircle2 className="h-5 w-5 text-primary" />;
      case "warning": return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case "error": return <XCircle className="h-5 w-5 text-destructive" />;
      default: return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-display font-bold">Notifications</h1>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20">
            <Bell className="h-16 w-16 mx-auto mb-4 text-muted-foreground/20" />
            <p className="text-muted-foreground font-display">No notifications yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map((n) => (
              <Card
                key={n.id}
                className={cn(
                  "rounded-2xl border-none transition-all cursor-pointer hover:bg-muted/30",
                  n.status === "unread" ? "bg-primary/[0.04] ring-1 ring-primary/10 shadow-sm" : "bg-muted/10 opacity-80"
                )}
                onClick={() => {
                  if (n.status === "unread") markAsRead.mutate(n.id);
                  if (n.link) navigate(n.link);
                }}
              >
                <CardContent className="p-6">
                  <div className="flex gap-4">
                    <div className="mt-1 shrink-0">{getIcon(n.type)}</div>
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <h3 className={cn("font-display font-bold text-lg leading-tight", n.status === "unread" ? "text-foreground" : "text-muted-foreground")}>
                          {n.title}
                        </h3>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground whitespace-nowrap mt-1">
                          {format(new Date(n.created_at), "MMM d")}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {n.message}
                      </p>
                      {n.link && (
                        <div className="pt-2">
                           <Button variant="outline" size="sm" className="rounded-xl h-8 text-xs font-bold gap-2">
                            <CheckSquare className="h-3.5 w-3.5" /> View Response
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
