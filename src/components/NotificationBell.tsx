import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Info, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export default function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as unknown) as Notification[];
    },
  });

  const unreadCount = notifications.filter((n) => n.status === "unread").length;

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications" as any)
        .update({ status: "read" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications" as any)
        .update({ status: "read" })
        .eq("status", "unread");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const getIcon = (type: string) => {
    switch (type) {
      case "success": return <CheckCircle2 className="h-4 w-4 text-primary" />;
      case "warning": return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case "error": return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-xl">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-destructive text-white border-2 border-background rounded-full text-[10px] font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 rounded-2xl overflow-hidden shadow-2xl border-none" align="end">
        <div className="p-4 border-b flex items-center justify-between bg-muted/30">
          <h4 className="font-display font-bold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 text-[10px] uppercase font-bold tracking-wider hover:bg-primary/10 hover:text-primary" 
              onClick={(e) => {
                e.stopPropagation();
                markAllAsRead.mutate();
              }}
            >
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[350px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground italic text-xs">
              All caught up!
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "p-4 hover:bg-muted/50 transition-colors cursor-pointer relative",
                    n.status === "unread" && "bg-primary/[0.03]"
                  )}
                  onClick={() => {
                    if (n.status === "unread") markAsRead.mutate(n.id);
                    if (n.link) navigate(n.link);
                    setOpen(false);
                  }}
                >
                  <div className="flex gap-3">
                    <div className="mt-1 shrink-0">{getIcon(n.type)}</div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className={cn("text-xs font-bold leading-tight", n.status === "unread" ? "text-foreground" : "text-muted-foreground")}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-normal py-0.5">
                        {n.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground opacity-60">
                        {format(new Date(n.created_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="p-2 border-t text-center bg-muted/10">
          <Button variant="ghost" size="sm" className="w-full text-xs font-semibold rounded-xl" onClick={() => { navigate("/notifications"); setOpen(false); }}>
            View all history
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
