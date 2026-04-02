import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Shield, UserCog, Eye, Edit, Trash2, Tag, MapPin, UserX, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";

const roleIcons: Record<string, any> = {
  admin: Shield,
  manager: UserCog,
  supervisor: Eye,
  staff: User,
};

const roleColors: Record<string, string> = {
  admin: "bg-primary text-primary-foreground",
  manager: "bg-primary text-primary-foreground",
  supervisor: "bg-primary text-primary-foreground",
  staff: "bg-primary text-primary-foreground",
};

export interface UserCardProps {
  user: {
    user_id: string;
    full_name: string | null;
    email?: string | null;
  };
  role?: string;
  locationName?: string | null;
  customRoles?: string[];
  index?: number;
  terminated?: boolean;
  terminatedAt?: string | null;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReinstate?: () => void;
  showActions?: boolean;
}

export function UserCard({
  user,
  role = "staff",
  locationName,
  customRoles = [],
  index = 0,
  terminated = false,
  terminatedAt,
  onClick,
  onEdit,
  onDelete,
  onReinstate,
  showActions = true,
}: UserCardProps) {
  const RoleIcon = roleIcons[role.toLowerCase()] || User;
  const initials = (user.full_name || "?")[0].toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="h-full"
    >
      <Card
        className={`transition-all duration-300 h-full flex flex-col ${
          terminated
            ? "opacity-60 bg-muted/20"
            : "hover:-translate-y-1 " + (onClick ? "cursor-pointer" : "")
        }`}
        onClick={terminated ? undefined : onClick}
      >
        <CardHeader className="flex flex-row items-start justify-between pb-2 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${
              terminated
                ? "bg-muted/50 border-border/50"
                : "bg-primary/10 border-primary/20"
            }`}>
              {terminated ? (
                <UserX className="h-4 w-4 text-muted-foreground" />
              ) : (
                <span className="text-sm font-display font-bold text-primary">
                  {initials}
                </span>
              )}
            </div>
            <div className="min-w-0 flex flex-col">
              <CardTitle className="text-base font-display truncate leading-tight" title={user.full_name || "Unnamed"}>
                {user.full_name || "Unnamed"}
              </CardTitle>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {terminated ? (
                  <Badge variant="outline" className="text-xs px-1.5 h-5 gap-1 border-none bg-muted text-muted-foreground">
                    <UserX className="h-2.5 w-2.5" />
                    Terminated
                  </Badge>
                ) : (
                  <Badge variant="outline" className={`text-xs px-1.5 h-5 gap-1 border-none ${roleColors[role.toLowerCase()] || ""}`}>
                    <RoleIcon className="h-2.5 w-2.5" />
                    <span className="capitalize">{role}</span>
                  </Badge>
                )}
              </div>
            </div>
          </div>
          {showActions && terminated && onReinstate && (
            <div className="flex gap-1 shrink-0 -mt-1 -mr-2" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={onReinstate} title="Reinstate user">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          )}
          {showActions && !terminated && (onEdit || onDelete) && (
            <div className="flex gap-1 shrink-0 -mt-1 -mr-2" onClick={(e) => e.stopPropagation()}>
              {onEdit && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-muted" onClick={onEdit}>
                  <Edit className="h-4 w-4" />
                </Button>
              )}
              {onDelete && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0 space-y-3 flex flex-col flex-1">
          <div className="flex flex-col gap-2">
            {locationName && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pr-2 truncate">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{locationName}</span>
              </div>
            )}
            {!terminated && customRoles.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {customRoles.map((cr, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="text-xs gap-0.5 bg-muted/30 border-none h-5"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {cr}
                  </Badge>
                ))}
              </div>
            )}
            {terminated && terminatedAt && (
              <p className="text-xs text-muted-foreground">
                Terminated {new Date(terminatedAt).toLocaleDateString()}
              </p>
            )}
          </div>

          <div className="flex-1 min-h-[8px]" />

        </CardContent>
      </Card>
    </motion.div>
  );
}
