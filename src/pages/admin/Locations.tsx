import { useState, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLocationData } from "@/hooks/useLocationData";
import { LocationCard } from "@/components/admin/LocationCard";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Plus, Trash2, Edit, Tag, X, ArrowLeft, AlertTriangle, ClipboardCheck, FileText, ShieldAlert, Search, Clock } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const TAG_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

export default function Locations() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  
  const selectedLocationId = searchParams.get("id");
  const setSelectedLocationId = (id: string | null) => {
    if (id) setSearchParams({ id });
    else setSearchParams({});
  };

  // Tag creation state
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  const {
    locations,
    tags,
    tagAssignments,
    incidentReports,
    submissions,
    userRoles,
    userLocationMap,
    locationStats,
    getLocationTags,
    isLoading
  } = useLocationData(profile?.company_id);

  // Profile map for names
  const allUserIds = useMemo(() => {
    const ids = new Set<string>();
    incidentReports.forEach((r: any) => { ids.add(r.user_id); if (r.assigned_to) ids.add(r.assigned_to); });
    submissions.forEach((s: any) => { ids.add(s.user_id); });
    return [...ids];
  }, [incidentReports, submissions]);

  const { data: profileMap = {} } = useQuery({
    queryKey: ["profiles-map-locations", allUserIds],
    queryFn: async () => {
      if (!allUserIds.length) return {};
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", allUserIds);
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.user_id] = p.full_name || "Unknown"; });
      return map;
    },
    enabled: allUserIds.length > 0,
  });

  // Filtered data for selected location
  const locationIncidents = useMemo(() => {
    if (!selectedLocationId) return [];
    return incidentReports.filter((r: any) => r.location_id === selectedLocationId);
  }, [selectedLocationId, incidentReports]);

  const locationSubmissions = useMemo(() => {
    if (!selectedLocationId) return [];
    return submissions.filter((s: any) => userLocationMap[s.user_id] === selectedLocationId);
  }, [selectedLocationId, submissions, userLocationMap]);

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("No company");
      let locationId = editId;
      if (editId) {
        const { error } = await supabase.from("locations").update({ name, address }).eq("id", editId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("locations").insert({ name, address, company_id: profile.company_id }).select("id").single();
        if (error) throw error;
        locationId = data.id;
      }
      if (locationId) {
        await supabase.from("location_tag_assignments").delete().eq("location_id", locationId);
        if (selectedTagIds.length > 0) {
          const rows = selectedTagIds.map((tagId) => ({ location_id: locationId!, tag_id: tagId }));
          const { error } = await supabase.from("location_tag_assignments").insert(rows);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["location-tag-assignments"] });
      
      // Trigger Polar sync for new locations
      if (!editId && profile?.company_id) {
        supabase.functions.invoke("polar-sync-seats", {
          body: { company_id: profile.company_id }
        }).catch(err => console.error("Polar sync failed:", err));
      }
      
      toast.success(editId ? "Location updated" : "Location added");
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      if (profile?.company_id) {
        supabase.functions.invoke("polar-sync-seats", {
          body: { company_id: profile.company_id }
        }).catch(err => console.error("Polar sync failed:", err));
      }
      toast.success("Location deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const createTagMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id || !newTagName.trim()) throw new Error("Tag name required");
      const { error } = await supabase.from("location_tags").insert({
        company_id: profile.company_id,
        name: newTagName.trim(),
        color: newTagColor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location-tags"] });
      toast.success("Tag created");
      setNewTagName("");
      setNewTagColor(TAG_COLORS[0]);
      setTagPopoverOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("location_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location-tags"] });
      queryClient.invalidateQueries({ queryKey: ["location-tag-assignments"] });
      toast.success("Tag deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setName("");
    setAddress("");
    setEditId(null);
    setSelectedTagIds([]);
    setOpen(false);
  };

  const startEdit = (loc: any) => {
    setName(loc.name);
    setAddress(loc.address || "");
    setEditId(loc.id);
    const locTags = tagAssignments.filter((ta: any) => ta.location_id === loc.id).map((ta: any) => ta.tag_id);
    setSelectedTagIds(locTags);
    setOpen(true);
  };

  // We no longer need the local getLocationTags function because useLocationData provides it.

  const selectedLocation = locations.find((l: any) => l.id === selectedLocationId);

  // ──────────────────── DETAIL VIEW ────────────────────
  if (selectedLocationId && selectedLocation) {
    const stats = locationStats[selectedLocationId];
    return (
      <div className="space-y-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2 text-muted-foreground"
            onClick={() => setSelectedLocationId(null)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            All Locations
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold flex items-center gap-2">
                <MapPin className="h-6 w-6 text-primary" />
                {selectedLocation.name}
              </h1>
              {selectedLocation.address && (
                <p className="text-muted-foreground text-sm mt-1">{selectedLocation.address}</p>
              )}
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={() => startEdit(selectedLocation)}>
                <Edit className="h-3.5 w-3.5" /> Edit
              </Button>
            </div>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="rounded-xl">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats?.incidents.total || 0}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                <AlertTriangle className="h-3 w-3" /> Incidents
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-destructive">{stats?.incidents.open || 0}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                <ShieldAlert className="h-3 w-3" /> Open
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats?.submissions.total || 0}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                <ClipboardCheck className="h-3 w-3" /> Submissions
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-500">{stats?.submissions.pending || 0}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                <Clock className="h-3 w-3" /> Pending Review
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for incidents and submissions */}
        <Tabs defaultValue="incidents" className="space-y-4">
          <TabsList className="rounded-xl">
            <TabsTrigger value="incidents" className="rounded-lg gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Incidents ({locationIncidents.length})
            </TabsTrigger>
            <TabsTrigger value="submissions" className="rounded-lg gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Submissions ({locationSubmissions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="incidents">
            <Card className="rounded-2xl">
              <CardContent className="p-0">
                {locationIncidents.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No incident reports for this location.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Reporter</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {locationIncidents.map((r: any) => (
                        <TableRow
                          key={r.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/admin/incidents/${r.id}`)}
                        >
                          <TableCell className="text-sm tabular-nums whitespace-nowrap">
                            {format(new Date(r.incident_date), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-sm">
                            {(profileMap as any)[r.user_id] || "—"}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium">{r.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">{r.description}</p>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={r.status === "open" ? "destructive" : r.status === "investigating" ? "outline" : "secondary"}
                              className="text-xs"
                            >
                              {r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="submissions">
            <Card className="rounded-2xl">
              <CardContent className="p-0">
                {locationSubmissions.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No checklist submissions for this location.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Staff</TableHead>
                        <TableHead>Checklist</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {locationSubmissions.map((s: any) => (
                        <TableRow
                          key={s.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/admin/checklist-submissions/${s.id}`)}
                        >
                          <TableCell className="text-sm tabular-nums whitespace-nowrap">
                            {format(new Date(s.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-sm">
                            {(profileMap as any)[s.user_id] || "—"}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium">{s.template_title || "Untitled"}</p>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={s.status === "pending" ? "outline" : s.status === "approved" ? "secondary" : s.status === "rejected" ? "destructive" : "default"}
                              className="text-xs capitalize"
                            >
                              {s.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // ──────────────────── OVERVIEW ────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Locations</h1>
          <p className="text-muted-foreground">Manage your company locations</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); setOpen(o); }}>
          <DialogTrigger asChild>
            <Button className="rounded-xl gap-2">
              <Plus className="h-4 w-4" /> Add Location
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display">{editId ? "Edit" : "Add"} Location</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); upsertMutation.mutate(); }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required className="h-12 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-12 rounded-xl" />
              </div>
              {tags.length > 0 && (
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag: any) => {
                      const isSelected = selectedTagIds.includes(tag.id);
                      return (
                        <label key={tag.id} className="flex items-center gap-1.5 cursor-pointer">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => {
                              setSelectedTagIds((prev) =>
                                isSelected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                              );
                            }}
                          />
                          <Badge
                            variant="outline"
                            className="text-xs gap-1"
                            style={{ borderColor: tag.color || undefined, color: tag.color || undefined }}
                          >
                            <Tag className="h-2.5 w-2.5" />
                            {tag.name}
                          </Badge>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              <Button type="submit" className="w-full rounded-xl h-12" disabled={upsertMutation.isPending}>
                {editId ? "Update" : "Add"} Location
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tags Section */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Tag className="h-4 w-4" /> Location Tags
            </CardTitle>
            <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs rounded-lg">
                  <Plus className="h-3 w-3" /> New Tag
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3 space-y-3" align="end">
                <Input
                  placeholder="Tag name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="h-9 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createTagMutation.mutate(); } }}
                />
                <div className="flex gap-1.5">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewTagColor(c)}
                      className="h-6 w-6 rounded-full  transition-transform"
                      style={{ backgroundColor: c, borderColor: newTagColor === c ? "hsl(var(--foreground))" : "transparent", transform: newTagColor === c ? "scale(1.15)" : "scale(1)" }}
                    />
                  ))}
                </div>
                <Button size="sm" className="w-full h-8" onClick={() => createTagMutation.mutate()} disabled={createTagMutation.isPending || !newTagName.trim()}>
                  Create Tag
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tags yet. Create tags to group locations.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag: any) => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className="text-xs gap-1.5 pr-1 group/tag"
                  style={{ borderColor: tag.color || undefined, color: tag.color || undefined }}
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => deleteTagMutation.mutate(tag.id)}
                    className="ml-0.5 opacity-0 group-hover/tag:opacity-100 transition-opacity hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className=" animate-pulse">
              <CardContent className="p-6 h-24" />
            </Card>
          ))}
        </div>
      ) : locations.length === 0 ? (
        <Card className="border -dashed ">
          <CardContent className="flex flex-col items-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No locations yet. Add your first location!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc: any, i: number) => {
            const locTags = getLocationTags(loc.id);
            const stats = locationStats[loc.id];
            return (
              <LocationCard
                key={loc.id}
                location={loc}
                tags={locTags}
                stats={stats}
                index={i}
                onClick={() => setSelectedLocationId(loc.id)}
                onEdit={() => startEdit(loc)}
                onDelete={() => deleteMutation.mutate(loc.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
