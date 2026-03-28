import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft, CalendarIcon, ImagePlus, X, Loader2, AlertTriangle,
  Camera, Clock, Shield, Users, Wrench, FileText, Check, ChevronsUpDown,
} from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { motion } from "framer-motion";
import BodyMap, { BODY_REGION_LABELS } from "@/components/BodyMap";
import { Badge } from "@/components/ui/badge";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";


const incidentTypes = [
  { value: "injury", label: "Injury" },
  { value: "property_damage", label: "Property Damage" },
  { value: "near_miss", label: "Near Miss" },
  { value: "environmental", label: "Environmental" },
  { value: "security", label: "Security" },
  { value: "other", label: "Other" },
];

interface FilePreview {
  file: File;
  url: string;
}

interface IncidentDetails {
  incident_time_hour: string;
  incident_time_minute: string;
  incident_time_period: string;
  incident_type: string;
  location_description: string;
  location_address: string;
  environmental_conditions: string;
  equipment_involved: string;
  injuries_reported: boolean;
  injuries: string;
  injured_body_parts: Record<string, string>;
  witnesses: string;
  involved_people: string[];
  first_aid_given: boolean;
  first_aid_details: string;
  immediate_actions: string;
  root_cause: string;
  recommendations: string;
  referral_needed: boolean;
  referral_for_treatment: string;
}

const defaultDetails: IncidentDetails = {
  incident_time_hour: "",
  incident_time_minute: "",
  incident_time_period: "AM",
  incident_type: "",
  location_description: "",
  location_address: "",
  environmental_conditions: "",
  equipment_involved: "",
  injuries_reported: false,
  injuries: "",
  injured_body_parts: {},
  witnesses: "",
  involved_people: [],
  first_aid_given: false,
  first_aid_details: "",
  immediate_actions: "",
  root_cause: "",
  recommendations: "",
  referral_needed: false,
  referral_for_treatment: "",
};

export default function ReportIncident() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity] = useState("medium");
  const [incidentDate, setIncidentDate] = useState<Date>(new Date());
  const [locationId, setLocationId] = useState<string>("");
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [details, setDetails] = useState<IncidentDetails>(defaultDetails);
  const [peopleSearchOpen, setPeopleSearchOpen] = useState(false);

  const hasChanges = title.length > 0 || description.length > 0 || files.length > 0 ||
    locationId !== "" ||
    JSON.stringify(details) !== JSON.stringify(defaultDetails);
  const { showDialog, confirmLeave, cancelLeave, safeNavigate } = useUnsavedChanges(hasChanges);

  const { data: locations } = useQuery({
    queryKey: ["company-locations"],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("id, name, address").order("name");
      return data || [];
    },
  });

  // Fetch users at selected location (or all company users if no location)
  const { data: locationUsers = [] } = useQuery({
    queryKey: ["location-users", locationId, profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      let query = supabase
        .from("profiles")
        .select("user_id, full_name, email, address")
        .eq("company_id", profile.company_id);
      // If location selected, filter by user_roles with that location
      if (locationId) {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("location_id", locationId);
        const userIds = (roleData || []).map((r) => r.user_id);
        if (userIds.length === 0) return [];
        query = query.in("user_id", userIds);
      }
      const { data } = await query.order("full_name");
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  const updateDetail = <K extends keyof IncidentDetails>(key: K, value: IncidentDetails[K]) => {
    setDetails((prev) => ({ ...prev, [key]: value }));
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    const newFiles: FilePreview[] = Array.from(selected)
      .filter((f) => {
        if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} exceeds 5MB limit`); return false; }
        return true;
      })
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Please fill in Title and Description.");
      return;
    }
    setSubmitting(true);
    try {
      // Build incident_time from hour/minute/period
      let incidentTimeStr = "";
      if (details.incident_time_hour && details.incident_time_minute) {
        let h = parseInt(details.incident_time_hour);
        if (details.incident_time_period === "PM" && h < 12) h += 12;
        if (details.incident_time_period === "AM" && h === 12) h = 0;
        incidentTimeStr = `${h.toString().padStart(2, "0")}:${details.incident_time_minute}`;
      }

      const { incident_time_hour, incident_time_minute, incident_time_period, referral_needed, referral_for_treatment, involved_people, ...detailsToSave } = details;
      // Build snapshot of involved people info
      const involvedPeopleSnapshot = involved_people.map((uid) => {
        const u = locationUsers.find((p) => p.user_id === uid);
        return { user_id: uid, full_name: u?.full_name || null, email: u?.email || null, address: (u as any)?.address || null };
      });
      const detailsWithTime = { ...detailsToSave, incident_time: incidentTimeStr, involved_people_snapshot: involvedPeopleSnapshot };

      const { data: report, error } = await supabase
        .from("incident_reports")
        .insert({
          title: title.trim(),
          description: description.trim(),
          severity,
          incident_date: incidentDate.toISOString(),
          user_id: user!.id,
          company_id: profile!.company_id!,
          location_id: locationId || null,
          details: detailsWithTime as any,
          involved_user_ids: involved_people,
          referral_for_treatment: details.referral_needed ? details.referral_for_treatment : null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      if (files.length > 0) {
        const paths: string[] = [];
        for (const { file } of files) {
          const ext = file.name.split(".").pop() || "jpg";
          const path = `incidents/${report.id}/${crypto.randomUUID()}.${ext}`;
          const { error: uploadErr } = await supabase.storage.from("audit-evidence").upload(path, file);
          if (uploadErr) { console.error("Upload error:", uploadErr); continue; }
          paths.push(path);
        }
        if (paths.length > 0) {
          await supabase.from("incident_reports").update({ attachments: paths } as any).eq("id", report.id);
        }
      }

      toast.success("Incident report submitted.");
      queryClient.invalidateQueries({ queryKey: ["my-incident-reports"] });
      navigate("/home");
    } catch (e: any) {
      toast.error(e.message || "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];
  const section = (delay: number, children: React.ReactNode) => (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.55, ease }}>
      {children}
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-background pb-24 overflow-x-hidden">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={() => safeNavigate("/home")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-display font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Report an Incident
          </h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* 1 — Overview */}
        {section(0, (
          <Card className="rounded-2xl">
            <CardContent className="p-4 space-y-3">
              <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> Incident Overview
              </h2>

              <div className="space-y-1.5">
                <Label htmlFor="ir-title" className="font-display font-semibold text-sm">Title *</Label>
                <Input id="ir-title" placeholder="Brief summary…" value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl" />
              </div>

              <div className="space-y-1.5 min-w-0">
                  <Label className="font-display font-semibold text-sm">Incident Type</Label>
                  <Select value={details.incident_type} onValueChange={(v) => updateDetail("incident_type", v)}>
                    <SelectTrigger className="rounded-xl truncate"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {incidentTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 min-w-0">
                  <Label className="font-display font-semibold text-sm">Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl truncate", !incidentDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">{incidentDate ? format(incidentDate, "MMM d, yyyy") : "Pick date"}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={incidentDate} onSelect={(d) => d && setIncidentDate(d)} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label className="font-display font-semibold text-sm">Time</Label>
                  <div className="flex gap-1.5">
                    <Select value={details.incident_time_hour} onValueChange={(v) => updateDetail("incident_time_hour", v)}>
                      <SelectTrigger className="rounded-xl w-[70px]"><SelectValue placeholder="Hr" /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                          <SelectItem key={h} value={String(h)}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={details.incident_time_minute} onValueChange={(v) => updateDetail("incident_time_minute", v)}>
                      <SelectTrigger className="rounded-xl w-[70px]"><SelectValue placeholder="Min" /></SelectTrigger>
                      <SelectContent>
                        {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={details.incident_time_period} onValueChange={(v) => updateDetail("incident_time_period", v)}>
                      <SelectTrigger className="rounded-xl w-[70px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AM">AM</SelectItem>
                        <SelectItem value="PM">PM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* 2 — Location & Environment */}
        {section(0.06, (
          <Card className="rounded-2xl">
            <CardContent className="p-4 space-y-3">
              <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Shield className="h-4 w-4" /> Location & Environment
              </h2>

              {locations && locations.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="font-display font-semibold text-sm">Location</Label>
                  <Select value={locationId} onValueChange={(v) => {
                    setLocationId(v);
                    const loc = locations.find((l) => l.id === v);
                    if (loc) updateDetail("location_address", (loc as any).address || "");
                    // Clear involved people when location changes
                    updateDetail("involved_people", []);
                  }}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {locationId && (
                <div className="space-y-1.5">
                  <Label className="font-display font-semibold text-sm">Location Address</Label>
                  <Input
                    placeholder="Address for this location…"
                    value={details.location_address}
                    onChange={(e) => updateDetail("location_address", e.target.value)}
                    className="rounded-xl"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="font-display font-semibold text-sm">Specific Area / Description</Label>
                <Input placeholder="e.g. Loading dock, Bay 3" value={details.location_description} onChange={(e) => updateDetail("location_description", e.target.value)} className="rounded-xl" />
              </div>

              <div className="space-y-1.5">
                <Label className="font-display font-semibold text-sm">Environmental Conditions</Label>
                <Input placeholder="e.g. Wet floor, poor lighting" value={details.environmental_conditions} onChange={(e) => updateDetail("environmental_conditions", e.target.value)} className="rounded-xl" />
              </div>
            </CardContent>
          </Card>
        ))}

        {/* 3 — What Happened */}
        {section(0.12, (
          <Card className="rounded-2xl">
            <CardContent className="p-4 space-y-3">
              <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Wrench className="h-4 w-4" /> What Happened
              </h2>

              <div className="space-y-1.5">
                <Label htmlFor="ir-desc" className="font-display font-semibold text-sm">Description *</Label>
                <Textarea id="ir-desc" placeholder="Describe in detail what happened…" value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-xl min-h-[120px]" />
              </div>

              <div className="space-y-1.5">
                <Label className="font-display font-semibold text-sm">Equipment / Tools Involved</Label>
                <Input placeholder="e.g. Forklift, ladder" value={details.equipment_involved} onChange={(e) => updateDetail("equipment_involved", e.target.value)} className="rounded-xl" />
              </div>
            </CardContent>
          </Card>
        ))}

        {/* 4 — People Involved */}
        {section(0.18, (
          <Card className="rounded-2xl">
            <CardContent className="p-4 space-y-3">
              <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Users className="h-4 w-4" /> People Involved
              </h2>

              <div className="flex items-center justify-between">
                <Label className="font-display font-semibold text-sm">Were there injuries?</Label>
                <Switch checked={details.injuries_reported} onCheckedChange={(v) => updateDetail("injuries_reported", v)} />
              </div>
              {details.injuries_reported && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="font-display font-semibold text-sm">Tap the affected area(s)</Label>
                    <BodyMap
                      selectedParts={Object.keys(details.injured_body_parts)}
                      onToggle={(part) => {
                        setDetails((prev) => {
                          const next = { ...prev.injured_body_parts };
                          if (next[part] !== undefined) { delete next[part]; } else { next[part] = ""; }
                          return { ...prev, injured_body_parts: next };
                        });
                      }}
                    />
                  </div>

                  {Object.keys(details.injured_body_parts).length > 0 && (
                    <div className="space-y-2">
                      {Object.entries(details.injured_body_parts).map(([part, desc]) => (
                        <div key={part} className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                              {BODY_REGION_LABELS[part] || part}
                            </Badge>
                            <button
                              type="button"
                              onClick={() => setDetails((prev) => {
                                const next = { ...prev.injured_body_parts };
                                delete next[part];
                                return { ...prev, injured_body_parts: next };
                              })}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <Input
                            placeholder={`Describe injury to ${BODY_REGION_LABELS[part] || part}…`}
                            value={desc}
                            onChange={(e) => setDetails((prev) => ({
                              ...prev,
                              injured_body_parts: { ...prev.injured_body_parts, [part]: e.target.value },
                            }))}
                            className="rounded-xl text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="font-display font-semibold text-sm">Additional Injury Details</Label>
                    <Textarea placeholder="Any other injury details…" value={details.injuries} onChange={(e) => updateDetail("injuries", e.target.value)} className="rounded-xl min-h-[80px]" />
                  </div>
                </div>
              )}

              {/* People Involved Multi-Select */}
              <div className="space-y-1.5">
                <Label className="font-display font-semibold text-sm">People Involved</Label>
                {details.involved_people.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {details.involved_people.map((uid) => {
                      const u = locationUsers.find((p) => p.user_id === uid);
                      return (
                        <Badge key={uid} variant="outline" className="gap-1 pr-1 text-xs">
                          {u?.full_name || "Unknown"}
                          <button onClick={() => updateDetail("involved_people", details.involved_people.filter((id) => id !== uid))} className="ml-0.5 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <Popover open={peopleSearchOpen} onOpenChange={setPeopleSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between rounded-xl text-sm font-normal text-muted-foreground">
                      Search and add people…
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search by name…" />
                      <CommandList>
                        <CommandEmpty>No users found.</CommandEmpty>
                        <CommandGroup>
                          {locationUsers
                            .filter((u) => !details.involved_people.includes(u.user_id))
                            .map((u) => (
                              <CommandItem
                                key={u.user_id}
                                value={u.full_name || u.user_id}
                                onSelect={() => {
                                  updateDetail("involved_people", [...details.involved_people, u.user_id]);
                                  setPeopleSearchOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", details.involved_people.includes(u.user_id) ? "opacity-100" : "opacity-0")} />
                                <div className="flex flex-col">
                                  <span className="font-medium">{u.full_name || "Unnamed"}</span>
                                  {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Selected people info cards */}
              {details.involved_people.length > 0 && (
                <div className="space-y-2">
                  {details.involved_people.map((uid) => {
                    const u = locationUsers.find((p) => p.user_id === uid);
                    if (!u) return null;
                    return (
                      <div key={uid} className="border rounded-xl p-3 space-y-1 text-sm bg-muted/30">
                        <p className="font-display font-bold">{u.full_name || "Unnamed"}</p>
                        {u.email && <p className="text-muted-foreground text-xs">{u.email}</p>}
                        {(u as any).address && <p className="text-muted-foreground text-xs">{(u as any).address}</p>}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="font-display font-semibold text-sm">Other Witnesses</Label>
                <Input placeholder="Names of additional witnesses not in system" value={details.witnesses} onChange={(e) => updateDetail("witnesses", e.target.value)} className="rounded-xl" />
              </div>

              <div className="flex items-center justify-between">
                <Label className="font-display font-semibold text-sm">Was first aid given?</Label>
                <Switch checked={details.first_aid_given} onCheckedChange={(v) => updateDetail("first_aid_given", v)} />
              </div>
              {details.first_aid_given && (
                <div className="space-y-1.5">
                  <Label className="font-display font-semibold text-sm">First Aid Details</Label>
                  <Textarea placeholder="Describe first aid administered…" value={details.first_aid_details} onChange={(e) => updateDetail("first_aid_details", e.target.value)} className="rounded-xl min-h-[80px]" />
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {/* 5 — Response & Actions */}
        {section(0.24, (
          <Card className="rounded-2xl">
            <CardContent className="p-4 space-y-3">
              <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Shield className="h-4 w-4" /> Response & Actions
              </h2>

              <div className="space-y-1.5">
                <Label className="font-display font-semibold text-sm">Immediate Actions Taken</Label>
                <Textarea placeholder="What was done right away?" value={details.immediate_actions} onChange={(e) => updateDetail("immediate_actions", e.target.value)} className="rounded-xl min-h-[80px]" />
              </div>

              <div className="space-y-1.5">
                <Label className="font-display font-semibold text-sm">Suspected Root Cause</Label>
                <Textarea placeholder="What do you think caused the incident?" value={details.root_cause} onChange={(e) => updateDetail("root_cause", e.target.value)} className="rounded-xl min-h-[80px]" />
              </div>

              <div className="space-y-1.5">
                <Label className="font-display font-semibold text-sm">Recommended Corrective Actions</Label>
                <Textarea placeholder="What should be done to prevent this?" value={details.recommendations} onChange={(e) => updateDetail("recommendations", e.target.value)} className="rounded-xl min-h-[80px]" />
              </div>
            </CardContent>
          </Card>
        ))}

        {/* 6 — Referral for Further Treatment */}
        {section(0.27, (
          <Card className="rounded-2xl">
            <CardContent className="p-4 space-y-3">
              <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Shield className="h-4 w-4" /> Referral for Further Treatment
              </h2>

              <div className="flex items-center justify-between">
                <Label className="font-display font-semibold text-sm">Is a referral needed?</Label>
                <Switch checked={details.referral_needed} onCheckedChange={(v) => updateDetail("referral_needed", v)} />
              </div>
              {details.referral_needed && (
                <div className="space-y-1.5">
                  <Label className="font-display font-semibold text-sm">Referral Details</Label>
                  <Textarea placeholder="Describe the referral, treatment provider, recommendations…" value={details.referral_for_treatment} onChange={(e) => updateDetail("referral_for_treatment", e.target.value)} className="rounded-xl min-h-[100px]" />
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {/* 7 — Evidence */}
        {section(0.3, (
          <Card className="rounded-2xl">
            <CardContent className="p-4 space-y-3">
              <h2 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <ImagePlus className="h-4 w-4" /> Evidence
              </h2>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFilesSelected} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFilesSelected} />
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="relative group w-16 h-16 rounded-xl overflow-hidden border border-border">
                      <img src={f.url} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeFile(i)} className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-4 w-4" /> Take Photo
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus className="h-4 w-4" /> Gallery
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fixed bottom submit */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t z-10">
        <div className="max-w-lg mx-auto px-4 py-3">
          <Button onClick={handleSubmit} disabled={submitting || !title.trim() || !description.trim()} className="w-full h-12 rounded-2xl text-base font-bold">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting…</> : "Submit Report"}
          </Button>
        </div>
      </div>

      <AlertDialog open={showDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved progress on this report. Are you sure you want to leave?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelLeave}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
