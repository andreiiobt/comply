/**
 * Centralised status colour definitions.
 * Use these everywhere instead of inline conditional class strings.
 */

// Incident report statuses
export const incidentStatusConfig: Record<string, { label: string; className: string }> = {
  open: {
    label: "Open",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  investigating: {
    label: "Investigating",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  },
  resolved: {
    label: "Resolved",
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  closed: {
    label: "Closed",
    className: "bg-muted text-muted-foreground border-border",
  },
};

// Checklist submission statuses — text colour for inline use
export function submissionStatusColor(status: string): string {
  if (status === "approved") return "text-primary";
  if (status === "rejected") return "text-destructive";
  return "text-muted-foreground";
}

// Checklist submission statuses — badge variant for Badge component
export function submissionBadgeVariant(status: string): "default" | "destructive" | "secondary" | "outline" {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  return "secondary";
}
