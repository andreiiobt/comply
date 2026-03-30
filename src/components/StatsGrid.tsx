import { type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";

export interface StatItem {
  title: string;
  value: string;
  icon: LucideIcon;
  /** Tailwind text colour class e.g. "text-primary" */
  color: string;
  /** If true, renders value in text-destructive */
  highlight?: boolean;
  href?: string;
}

interface StatsGridProps {
  stats: StatItem[];
  onStatClick?: (stat: StatItem) => void;
  /** Number of columns on large screens. Defaults to 4. */
  cols?: 4 | 5;
}

export function StatsGrid({ stats, onStatClick, cols = 4 }: StatsGridProps) {
  const lgCols = cols === 5 ? "sm:grid-cols-3 lg:grid-cols-5" : "lg:grid-cols-4";

  return (
    <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${lgCols}`}>
      {stats.map((stat, i) => {
        const clickable = !!(stat.href || onStatClick);
        return (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card
              className={`rounded-2xl transition-shadow ${clickable ? "cursor-pointer hover:shadow-md" : ""}`}
              onClick={clickable ? () => onStatClick?.(stat) : undefined}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl sm:text-3xl font-display font-bold ${
                    stat.highlight ? "text-destructive" : ""
                  }`}
                >
                  {stat.value}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
