import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, AlertTriangle, User, MapPin, Calendar, ImageIcon, Clock, Shield, Users, Wrench, X, Mail, Home } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import BodyMap, { BODY_REGION_LABELS } from "@/components/BodyMap";


const statusColor: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 border-blue-200",
  investigating: "bg-amber-100 text-amber-800 border-amber-200",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  closed: "bg-muted text-muted-foreground",
};

const typeLabels: Record<string, string> = {
  injury: "Injury",
  property_damage: "Property Damage",
  near_miss: "Near Miss",
  environmental: "Environmental",
  security: "Security",
  other: "Other",
};

function getPublicUrl(path: string) {
  return supabase.storage.from("audit-evidence").getPublicUrl(path).data.publicUrl;
}

interface IncidentDetails {
  incident_time?: string;
  incident_type?: string;
  location_description?: string;
  location_address?: string;
  environmental_conditions?: string;
  equipment_involved?: string;
  injuries_reported?: boolean;
  injuries?: string;
  injured_body_parts?: Record<string, string>;
  witnesses?: string;
  involved_people_snapshot?: Array<{ user_id: string; full_name: string | null; email: string | null; address: string | null }>;
  first_aid_given?: boolean;
  first_aid_details?: string;
  immediate_actions?: string;
  root_cause?: string;
  recommendations?: string;
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-display font-bold text-muted-foreground">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function UserLink({ userId, name, basePath }: { userId: string; name: string; basePath: string }) {
  const profilePath = basePath === "/admin" ? `/admin/users/${userId}` : basePath === "/supervisor" ? `/supervisor/staff/${userId}` : `/manager/staff/${userId}`;
  return (
    <Link to={profilePath} className="text-primary hover:underline font-display font-bold">
      {name}
    </Link>
  );
}

export default function IncidentReportDetail({ basePath }: { basePath: string }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: report, isLoading } = useQuery({
    queryKey: ["incident-report-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("incident_reports").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: reporter } = useQuery({
    queryKey: ["profile-detail", report?.user_id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, user_id, email, address").eq("user_id", report!.user_id).single();
      return data;
    },
    enabled: !!report?.user_id,
  });

  const { data: location } = useQuery({
    queryKey: ["location-detail", report?.location_id],
    queryFn: async () => {
      if (!report?.location_id) return null;
      const { data } = await supabase.from("locations").select("name").eq("id", report.location_id).single();
      return data;
    },
    enabled: !!report?.location_id,
  });

  // Fetch all company profiles for assignment dropdowns
  const { data: companyProfiles = [] } = useQuery({
    queryKey: ["company-profiles-for-assignment"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data || [];
    },
  });

  // Fetch assigned_to profile
  const assignedToId = (report as any)?.assigned_to as string | null;
  const { data: assignedToProfile } = useQuery({
    queryKey: ["profile-detail", assignedToId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, user_id").eq("user_id", assignedToId!).single();
      return data;
    },
    enabled: !!assignedToId,
  });

  // Fetch involved user profiles
  const involvedIds: string[] = Array.isArray((report as any)?.involved_user_ids) ? (report as any).involved_user_ids : [];
  const { data: involvedProfiles = [] } = useQuery({
    queryKey: ["profiles-involved", involvedIds],
    queryFn: async () => {
      if (!involvedIds.length) return [];
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", involvedIds);
      return data || [];
    },
    enabled: involvedIds.length > 0,
  });

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    await supabase.from("incident_reports").update({ status: newStatus }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["incident-report-detail", id] });
  };

  const handleAssignedToChange = async (userId: string) => {
    if (!id) return;
    const val = userId === "none" ? null : userId;
    const { error } = await supabase.from("incident_reports").update({ assigned_to: val } as any).eq("id", id);
    if (error) { toast.error("Failed to update assignment"); return; }
    toast.success("Assigned user updated");
    queryClient.invalidateQueries({ queryKey: ["incident-report-detail", id] });
  };

  const handleAddInvolved = async (userId: string) => {
    if (!id || userId === "none" || involvedIds.includes(userId)) return;
    const updated = [...involvedIds, userId];
    const { error } = await supabase.from("incident_reports").update({ involved_user_ids: updated } as any).eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    toast.success("User added");
    queryClient.invalidateQueries({ queryKey: ["incident-report-detail", id] });
  };

  const handleRemoveInvolved = async (userId: string) => {
    if (!id) return;
    const updated = involvedIds.filter((uid) => uid !== userId);
    const { error } = await supabase.from("incident_reports").update({ involved_user_ids: updated } as any).eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    queryClient.invalidateQueries({ queryKey: ["incident-report-detail", id] });
  };

  const attachments: string[] = Array.isArray(report?.attachments) ? (report.attachments as string[]) : [];
  const details: IncidentDetails = (report as any)?.details || {};

  if (isLoading || !report) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <button onClick={() => navigate(`${basePath}/incidents`)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Incident Reports
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-extrabold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            {report.title}
          </h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(report.incident_date), "MMM d, yyyy 'at' h:mm a")}
            </span>
            {details.incident_time && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {details.incident_time}
              </span>
            )}
            {details.incident_type && (
              <Badge variant="outline" className="text-xs capitalize">
                {typeLabels[details.incident_type] || details.incident_type}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Reporter & location */}
      <Card className="rounded-2xl">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Reported by: </span>
            {reporter ? (
              <UserLink userId={reporter.user_id} name={reporter.full_name || "Unknown"} basePath={basePath} />
            ) : (
              <span className="font-display font-bold">Unknown</span>
            )}
          </div>
          {(reporter as any)?.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>{(reporter as any).email}</span>
            </div>
          )}
          {(reporter as any)?.address && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Home className="h-4 w-4" />
              <span>{(reporter as any).address}</span>
            </div>
          )}
          {location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{location.name}</span>
            </div>
          )}
          {details.location_address && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pl-6">
              <span>{details.location_address}</span>
            </div>
          )}
          <DetailRow label="Specific Area" value={details.location_description} />
          <DetailRow label="Environmental Conditions" value={details.environmental_conditions} />
        </CardContent>
      </Card>

      {/* Assignment Section */}
      <Card className="rounded-2xl">
        <CardContent className="p-5 space-y-4">
          <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Users className="h-4 w-4" /> Assignment
          </h2>

          {/* Assigned To */}
          <div className="space-y-1.5">
            <p className="text-xs font-display font-bold text-muted-foreground">Incident Subject (Assigned To)</p>
            <div className="flex items-center gap-2">
              <Select value={assignedToId || "none"} onValueChange={handleAssignedToChange}>
                <SelectTrigger className="w-[240px] rounded-xl text-sm"><SelectValue placeholder="Select user…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Not assigned —</SelectItem>
                  {companyProfiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "Unnamed"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assignedToProfile && (
                <UserLink userId={assignedToProfile.user_id} name={assignedToProfile.full_name || "Unknown"} basePath={basePath} />
              )}
            </div>
          </div>

          {/* Involved Users */}
          <div className="space-y-1.5">
            <p className="text-xs font-display font-bold text-muted-foreground">Involved Users</p>
            {involvedProfiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {involvedProfiles.map((p) => (
                  <Badge key={p.user_id} variant="outline" className="gap-1 pr-1 text-xs">
                    <Link to={basePath === "/admin" ? `/admin/users/${p.user_id}` : basePath === "/supervisor" ? `/supervisor/staff/${p.user_id}` : `/manager/staff/${p.user_id}`} className="hover:underline">
                      {p.full_name || "Unnamed"}
                    </Link>
                    <button onClick={() => handleRemoveInvolved(p.user_id)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Select value="none" onValueChange={handleAddInvolved}>
              <SelectTrigger className="w-[240px] rounded-xl text-sm"><SelectValue placeholder="Add user…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Select to add —</SelectItem>
                {companyProfiles
                  .filter((p) => !involvedIds.includes(p.user_id))
                  .map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "Unnamed"}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* What Happened */}
      <Card className="rounded-2xl">
        <CardContent className="p-5 space-y-3">
          <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Wrench className="h-4 w-4" /> What Happened
          </h2>
          <p className="text-sm whitespace-pre-wrap">{report.description}</p>
          <DetailRow label="Equipment / Tools Involved" value={details.equipment_involved} />
        </CardContent>
      </Card>

      {/* People Involved from snapshot */}
      {details.involved_people_snapshot && details.involved_people_snapshot.length > 0 && (
        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Users className="h-4 w-4" /> People Involved (at time of report)
            </h2>
            <div className="space-y-2">
              {details.involved_people_snapshot.map((person) => (
                <div key={person.user_id} className="border rounded-xl p-3 space-y-1 text-sm bg-muted/30">
                  <p className="font-display font-bold">{person.full_name || "Unknown"}</p>
                  {person.email && <p className="text-muted-foreground text-xs flex items-center gap-1"><Mail className="h-3 w-3" />{person.email}</p>}
                  {person.address && <p className="text-muted-foreground text-xs flex items-center gap-1"><Home className="h-3 w-3" />{person.address}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Injury Details */}
      {(details.injuries_reported || details.witnesses || details.first_aid_given) && (
        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Users className="h-4 w-4" /> Injury Details
            </h2>
            {details.injuries_reported && (
              <>
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">Injuries Reported</Badge>
                {details.injured_body_parts && Object.keys(details.injured_body_parts).length > 0 && (
                  <div className="space-y-2">
                    <BodyMap selectedParts={Object.keys(details.injured_body_parts)} readOnly />
                    <div className="space-y-1">
                      {Object.entries(details.injured_body_parts).map(([part, desc]) => (
                        <div key={part} className="flex items-start gap-2 text-sm">
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs shrink-0">
                            {BODY_REGION_LABELS[part] || part}
                          </Badge>
                          {desc && <span className="text-muted-foreground">{desc}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <DetailRow label="Additional Injury Details" value={details.injuries} />
              </>
            )}
            <DetailRow label="Witnesses" value={details.witnesses} />
            {details.first_aid_given && (
              <>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">First Aid Administered</Badge>
                <DetailRow label="First Aid Details" value={details.first_aid_details} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Response & Actions */}
      {(details.immediate_actions || details.root_cause || details.recommendations) && (
        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Shield className="h-4 w-4" /> Response & Actions
            </h2>
            <DetailRow label="Immediate Actions Taken" value={details.immediate_actions} />
            <DetailRow label="Suspected Root Cause" value={details.root_cause} />
            <DetailRow label="Recommended Corrective Actions" value={details.recommendations} />
          </CardContent>
        </Card>
      )}

      {/* Referral for Further Treatment */}
      {(report as any).referral_for_treatment && (
        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Shield className="h-4 w-4" /> Referral for Further Treatment
            </h2>
            <p className="text-sm whitespace-pre-wrap">{(report as any).referral_for_treatment}</p>
          </CardContent>
        </Card>
      )}

      {/* Evidence */}
      {attachments.length > 0 && (
        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4" /> Evidence ({attachments.length})
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {attachments.map((path, i) => (
                <a key={i} href={getPublicUrl(path)} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-xl overflow-hidden border border-border hover:ring-2 hover:ring-ring transition-shadow">
                  <img src={getPublicUrl(path)} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status */}
      <Card className="rounded-2xl">
        <CardContent className="p-5 space-y-3">
          <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide">Status</h2>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`capitalize text-xs ${statusColor[report.status] || ""}`}>
              {report.status}
            </Badge>
            <Select value={report.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[160px] rounded-xl text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="investigating">Investigating</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Reported {format(new Date(report.created_at), "MMM d, yyyy")} · Last updated {format(new Date(report.updated_at), "MMM d, yyyy")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
