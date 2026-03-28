import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarIcon, ImagePlus, X, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FilePreview {
  file: File;
  url: string;
}

export default function IncidentReportDialog({ open, onOpenChange }: Props) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity] = useState("medium");
  const [incidentDate, setIncidentDate] = useState<Date>(new Date());
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [referralNeeded, setReferralNeeded] = useState(false);
  const [referralDetails, setReferralDetails] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [involvedPeople, setInvolvedPeople] = useState<string[]>([]);
  const [peopleSearchOpen, setPeopleSearchOpen] = useState(false);

  const { data: locations } = useQuery({
    queryKey: ["company-locations"],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("id, name, address").order("name");
      return data || [];
    },
  });

  const { data: locationUsers = [] } = useQuery({
    queryKey: ["location-users-dialog", locationId, profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      let query = supabase.from("profiles").select("user_id, full_name, email, address").eq("company_id", profile.company_id);
      if (locationId) {
        const { data: roleData } = await supabase.from("user_roles").select("user_id").eq("location_id", locationId);
        const userIds = (roleData || []).map((r) => r.user_id);
        if (userIds.length === 0) return [];
        query = query.in("user_id", userIds);
      }
      const { data } = await query.order("full_name");
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  const reset = () => {
    setTitle("");
    setDescription("");
    setIncidentDate(new Date());
    setReferralNeeded(false);
    setReferralDetails("");
    setLocationId("");
    setLocationAddress("");
    setInvolvedPeople([]);
    files.forEach((f) => URL.revokeObjectURL(f.url));
    setFiles([]);
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    const newFiles: FilePreview[] = Array.from(selected).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      const involvedPeopleSnapshot = involvedPeople.map((uid) => {
        const u = locationUsers.find((p) => p.user_id === uid);
        return { user_id: uid, full_name: u?.full_name || null, email: u?.email || null, address: (u as any)?.address || null };
      });

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
          involved_user_ids: involvedPeople,
          details: { location_address: locationAddress, involved_people_snapshot: involvedPeopleSnapshot } as any,
          referral_for_treatment: referralNeeded ? referralDetails : null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      if (files.length > 0) {
        const paths: string[] = [];
        for (const { file } of files) {
          const ext = file.name.split(".").pop() || "jpg";
          const path = `incidents/${report.id}/${crypto.randomUUID()}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from("audit-evidence")
            .upload(path, file);
          if (uploadErr) { console.error("Upload error:", uploadErr); continue; }
          paths.push(path);
        }
        if (paths.length > 0) {
          await supabase
            .from("incident_reports")
            .update({ attachments: paths } as any)
            .eq("id", report.id);
        }
      }

      toast.success("Incident report submitted.");
      queryClient.invalidateQueries({ queryKey: ["my-incident-reports"] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Report an Incident</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ir-title">Title *</Label>
            <Input id="ir-title" placeholder="Brief summary…" value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ir-desc">Description *</Label>
            <Textarea id="ir-desc" placeholder="What happened? Include details…" value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-xl min-h-[100px]" />
          </div>

          <div className="space-y-1.5">
            <Label>Date of Incident</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl", !incidentDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {incidentDate ? format(incidentDate, "MMM d, yyyy") : "Pick date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={incidentDate} onSelect={(d) => d && setIncidentDate(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Location */}
          {locations && locations.length > 0 && (
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Select value={locationId} onValueChange={(v) => {
                setLocationId(v);
                const loc = locations.find((l) => l.id === v);
                setLocationAddress((loc as any)?.address || "");
                setInvolvedPeople([]);
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
              <Label>Location Address</Label>
              <Input placeholder="Address…" value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} className="rounded-xl" />
            </div>
          )}

          {/* People Involved */}
          <div className="space-y-1.5">
            <Label>People Involved</Label>
            {involvedPeople.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {involvedPeople.map((uid) => {
                  const u = locationUsers.find((p) => p.user_id === uid);
                  return (
                    <Badge key={uid} variant="outline" className="gap-1 pr-1 text-xs">
                      {u?.full_name || "Unknown"}
                      <button onClick={() => setInvolvedPeople((prev) => prev.filter((id) => id !== uid))} className="ml-0.5 hover:text-destructive">
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
                        .filter((u) => !involvedPeople.includes(u.user_id))
                        .map((u) => (
                          <CommandItem
                            key={u.user_id}
                            value={u.full_name || u.user_id}
                            onSelect={() => {
                              setInvolvedPeople((prev) => [...prev, u.user_id]);
                              setPeopleSearchOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", involvedPeople.includes(u.user_id) ? "opacity-100" : "opacity-0")} />
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

          {/* Referral Section */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Referral for further treatment?</Label>
              <input type="checkbox" checked={referralNeeded} onChange={(e) => setReferralNeeded(e.target.checked)} className="rounded" />
            </div>
            {referralNeeded && (
              <Textarea placeholder="Describe referral details…" value={referralDetails} onChange={(e) => setReferralDetails(e.target.value)} className="rounded-xl min-h-[80px]" />
            )}
          </div>

          {/* File attachments */}
          <div className="space-y-1.5">
            <Label>Photos / Evidence</Label>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFilesSelected} />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={i} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border">
                    <img src={f.url} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removeFile(i)} className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-bl-lg p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => fileInputRef.current?.click()}>
              <ImagePlus className="h-4 w-4" />
              Add Photos
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-xl" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
