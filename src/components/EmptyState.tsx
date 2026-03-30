import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Render without the card wrapper — useful inside existing Card components */
  inline?: boolean;
}

function EmptyStateContent({ icon: Icon, title, description, action }: Omit<EmptyStateProps, "inline">) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      )}
      {action && (
        <Button variant="outline" size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ inline, ...props }: EmptyStateProps) {
  if (inline) {
    return <EmptyStateContent {...props} />;
  }
  return (
    <Card className="rounded-2xl border-dashed">
      <CardContent className="p-0">
        <EmptyStateContent {...props} />
      </CardContent>
    </Card>
  );
}
