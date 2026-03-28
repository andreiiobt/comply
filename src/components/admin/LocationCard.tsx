import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, AlertTriangle, ClipboardCheck, Edit, Trash2, Tag, ShieldAlert, Clock } from "lucide-react";
import { motion } from "framer-motion";

export interface TagData {
  id: string;
  name: string;
  color?: string | null;
}

export interface LocationStats {
  incidents: { total: number; open: number; investigating: number; resolved: number };
  submissions: { total: number; pending: number; approved: number; rejected: number };
}

export interface LocationCardProps {
  location: {
    id: string;
    name: string;
    address?: string | null;
  };
  tags?: TagData[];
  stats?: LocationStats;
  index?: number;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
}

export function LocationCard({ 
  location, 
  tags = [], 
  stats, 
  index = 0, 
  onClick, 
  onEdit, 
  onDelete,
  showActions = true 
}: LocationCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="h-full">
      <Card
        className={`hover:-translate-y-1 transition-all duration-300 h-full flex flex-col ${
          onClick ? "cursor-pointer" : ""
        }`}
        onClick={onClick}
      >
        <CardHeader className="flex flex-row items-start justify-between pb-2 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-secondary" />
            </div>
            <CardTitle className="text-base font-display truncate leading-tight" title={location.name}>
              {location.name}
            </CardTitle>
          </div>
          {showActions && (onEdit || onDelete) && (
            <div className="flex gap-1 shrink-0 -mt-1 -mr-2" onClick={(e) => e.stopPropagation()}>
              {onEdit && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onEdit}>
                  <Edit className="h-4 w-4" />
                </Button>
              )}
              {onDelete && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0 space-y-3 flex flex-col flex-1">
          {location.address && (
            <p className="text-sm text-muted-foreground line-clamp-2" title={location.address}>
              {location.address}
            </p>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className="text-[10px] gap-0.5"
                  style={{ borderColor: tag.color || undefined, color: tag.color || undefined }}
                >
                  <Tag className="h-2 w-2" />
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
          
          <div className="flex-1 min-h-[8px]" />
          
          {stats && (
            <div className="grid grid-cols-2 gap-2 pt-3 border-t-0 mt-auto">
              <div className="flex flex-col gap-1 p-2 rounded-xl bg-muted/40">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" />
                  Incidents
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold tabular-nums leading-none">{stats.incidents.total}</span>
                  {stats.incidents.open > 0 && (
                    <span className="text-xs font-medium text-destructive flex items-center gap-0.5 bg-destructive/10 px-1.5 py-0.5 rounded-md">
                      {stats.incidents.open} open
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1 p-2 rounded-xl bg-muted/40">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ClipboardCheck className="h-3 w-3" />
                  Reviews
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold tabular-nums leading-none">{stats.submissions.total}</span>
                  {stats.submissions.pending > 0 && (
                    <span className="text-xs font-medium text-amber-500 flex items-center gap-0.5 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                      {stats.submissions.pending} pending
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
