import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMergeLink } from "@mergeapi/react-merge-link";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plug, RefreshCw, Plus, Trash2, Loader2, CheckCircle2, XCircle, Clock, Mail, ArrowRight, Users } from "lucide-react";
import { format } from "date-fns";

type FieldMappings = {
  role_mapping: Record<string, string>;
  location_mapping: Record<string, string>;
  custom_role_mapping: Record<string, string>;
  default_role: string;
};

const EMPTY_MAPPINGS: FieldMappings = {
  role_mapping: {},
  location_mapping: {},
  custom_role_mapping: {},
  default_role: "staff",
};

type MappingChange = {
  user_id: string;
  full_name: string | null;
  hris_department: string;
  hris_job_title: string;
  hris_work_location: string;
  current_role: string | null;
  proposed_role: string;
  current_location: string | null;
  proposed_location: string | null;
  proposed_location_id: string | null;
  current_custom_roles: string[];
  proposed_custom_role: string | null;
  proposed_custom_role_id: string | null;
  role_changed: boolean;
  location_changed: boolean;
  custom_role_changed: boolean;
  role_row_id: string | null;
};

type EditableChange = MappingChange & {
  selected: boolean;
  edited_role: string;
  edited_location_id: string | null;
  edited_custom_role_id: string | null;
};

function BulkMappingPreview({ companyId, queryClient }: { companyId: string; queryClient: any }) {
  const [editableChanges, setEditableChanges] = useState<EditableChange[]>([]);
  const [totalSynced, setTotalSynced] = useState(0);
  const [previewed, setPreviewed] = useState(false);

  const { data: previewLocations } = useQuery({
    queryKey: ["locations", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("id, name").order("name");
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: previewCustomRoles } = useQuery({
    queryKey: ["custom-roles", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("custom_roles").select("id, name").order("name");
      return data || [];
    },
    enabled: !!companyId,
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("apply-hris-mappings", {
        body: { company_id: companyId, apply: false },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const changes: MappingChange[] = data.changes || [];
      setEditableChanges(
        changes.map((c) => ({
          ...c,
          selected: true,
          edited_role: c.proposed_role,
          edited_location_id: c.proposed_location_id || null,
          edited_custom_role_id: c.proposed_custom_role_id || null,
        }))
      );
      setTotalSynced(data.total_synced || 0);
      setPreviewed(true);
      if (changes.length === 0) {
        toast.info("All synced users already match the current mappings.");
      }
    },
    onError: (e: any) => toast.error(`Preview failed: ${e.message}`),
  });

  const selectedChanges = editableChanges.filter((c) => c.selected);

  const applyMutation = useMutation({
    mutationFn: async () => {
      const overrides = selectedChanges.map((c) => ({
        user_id: c.user_id,
        role: c.edited_role,
        location_id: c.edited_location_id,
        custom_role_id: c.edited_custom_role_id,
        role_row_id: c.role_row_id,
      }));
      const { data, error } = await supabase.functions.invoke("apply-hris-mappings", {
        body: { company_id: companyId, apply: true, overrides },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Applied changes to ${data.applied_count || 0} user(s).`);
      setEditableChanges([]);
      setPreviewed(false);
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-custom-roles"] });
    },
    onError: (e: any) => toast.error(`Apply failed: ${e.message}`),
  });

  const updateChange = (userId: string, field: keyof EditableChange, value: any) => {
    setEditableChanges((prev) =>
      prev.map((c) => (c.user_id === userId ? { ...c, [field]: value } : c))
    );
  };

  const allSelected = editableChanges.length > 0 && editableChanges.every((c) => c.selected);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Bulk Apply Mappings
            </CardTitle>
            <CardDescription>
              Preview and apply your field mappings to all HRIS-synced users at once.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending}
          >
            {previewMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Preview Changes
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!previewed ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Click "Preview Changes" to see what would be updated based on your current field mappings.
          </p>
        ) : editableChanges.length === 0 ? (
          <div className="text-center py-6">
            <CheckCircle2 className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              All {totalSynced} synced user(s) already match the current mappings. No changes needed.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {editableChanges.length} of {totalSynced} synced user(s) have changes. Edit values inline before applying.
            </p>
            <div className="border rounded-md overflow-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) =>
                          setEditableChanges((prev) =>
                            prev.map((c) => ({ ...c, selected: !!checked }))
                          )
                        }
                      />
                    </TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>HRIS Dept / Title</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Custom Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editableChanges.map((c) => (
                    <TableRow key={c.user_id} className={!c.selected ? "opacity-50" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={c.selected}
                          onCheckedChange={(checked) =>
                            updateChange(c.user_id, "selected", !!checked)
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {c.full_name || "Unknown"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[c.hris_department, c.hris_job_title].filter(Boolean).join(" / ")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {c.current_role && (
                            <>
                              <Badge variant="outline" className="text-xs">{c.current_role}</Badge>
                              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            </>
                          )}
                          <Select
                            value={c.edited_role}
                            onValueChange={(v) => updateChange(c.user_id, "edited_role", v)}
                          >
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="staff">Staff</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {c.current_location && (
                            <>
                              <Badge variant="outline" className="text-xs">{c.current_location}</Badge>
                              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            </>
                          )}
                          <Select
                            value={c.edited_location_id || "none"}
                            onValueChange={(v) =>
                              updateChange(c.user_id, "edited_location_id", v === "none" ? null : v)
                            }
                          >
                            <SelectTrigger className="h-7 w-36 text-xs">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {previewLocations?.map((l) => (
                                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={c.edited_custom_role_id || "none"}
                          onValueChange={(v) =>
                            updateChange(c.user_id, "edited_custom_role_id", v === "none" ? null : v)
                          }
                        >
                          <SelectTrigger className="h-7 w-36 text-xs">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {previewCustomRoles?.map((r) => (
                              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setEditableChanges([]); setPreviewed(false); }}>
                Cancel
              </Button>
              <Button
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending || selectedChanges.length === 0}
              >
                {applyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                )}
                Apply {selectedChanges.length} Change(s)
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}



export default function Integrations() {
  const { profile, user } = useAuth();
  const companyId = profile?.company_id;
  const queryClient = useQueryClient();

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [syncInterval, setSyncInterval] = useState("24");
  const [mappings, setMappings] = useState<FieldMappings>(EMPTY_MAPPINGS);
  const [newRoleKey, setNewRoleKey] = useState("");
  const [newRoleValue, setNewRoleValue] = useState("staff");
  const [newLocKey, setNewLocKey] = useState("");
  const [newLocValue, setNewLocValue] = useState("");
  const [newCrKey, setNewCrKey] = useState("");
  const [newCrValue, setNewCrValue] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  // Fetch integration
  const { data: integration, isLoading } = useQuery({
    queryKey: ["hris-integration", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("hris_integrations")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const fm = (data.field_mappings as any) || EMPTY_MAPPINGS;
        setMappings({
          role_mapping: fm.role_mapping || {},
          location_mapping: fm.location_mapping || {},
          custom_role_mapping: fm.custom_role_mapping || {},
          default_role: fm.default_role || "staff",
        });
        setSyncInterval(String(data.sync_interval_hours || 24));
      }
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch locations for mapping dropdown
  const { data: locations } = useQuery({
    queryKey: ["locations", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("id, name").order("name");
      return data || [];
    },
    enabled: !!companyId,
  });

  // Fetch custom roles for mapping dropdown
  const { data: customRoles } = useQuery({
    queryKey: ["custom-roles", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("custom_roles").select("id, name").order("name");
      return data || [];
    },
    enabled: !!companyId,
  });

  // Fetch HRIS fields (departments, locations, job titles) from Merge
  const { data: hrisFields, isLoading: hrisFieldsLoading, refetch: refetchHrisFields } = useQuery({
    queryKey: ["hris-fields", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("merge-fetch-fields", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      return data as { departments: string[]; work_locations: string[]; job_titles: string[] };
    },
    enabled: !!companyId && !!integration,
    staleTime: 1000 * 60 * 10,
  });

  // Combined department+job title list for role/custom-role mapping keys
  const hrisDeptOptions = [
    ...new Set([
      ...(hrisFields?.departments || []),
      ...(hrisFields?.job_titles || []),
    ]),
  ].sort();


  const { data: syncLogs } = useQuery({
    queryKey: ["hris-sync-logs", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("hris_sync_log")
        .select("*")
        .eq("company_id", companyId)
        .order("started_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!companyId,
  });

  // Merge Link success handler
  const onMergeLinkSuccess = useCallback(
    async (publicToken: string) => {
      try {
        const { data, error } = await supabase.functions.invoke("merge-link", {
          body: {
            action: "exchange-token",
            public_token: publicToken,
            company_id: companyId,
          },
        });
        if (error) throw error;
        toast.success(`Connected to ${data.integration_name || "HRIS"} successfully!`);
        queryClient.invalidateQueries({ queryKey: ["hris-integration"] });
      } catch (e: any) {
        toast.error(`Failed to connect: ${e.message}`);
      } finally {
        setIsConnecting(false);
        setLinkToken(null);
      }
    },
    [companyId, queryClient]
  );

  const { open: openMergeLink, isReady: isMergeLinkReady } = useMergeLink({
    linkToken: linkToken || "",
    onSuccess: onMergeLinkSuccess,
  });

  // Request a link token then open Merge Link
  const startConnect = async () => {
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("merge-link", {
        body: {
          action: "create-link-token",
          end_user_email: user?.email || "",
          end_user_org_name: profile?.full_name || "Company",
          end_user_origin_id: companyId,
        },
      });
      if (error) throw error;
      setLinkToken(data.link_token);
    } catch (e: any) {
      toast.error(`Failed to start connection: ${e.message}`);
      setIsConnecting(false);
    }
  };

  // Open merge link once token is ready
  const handleOpenMergeLink = useCallback(() => {
    if (linkToken && isMergeLinkReady) {
      openMergeLink();
    }
  }, [linkToken, isMergeLinkReady, openMergeLink]);

  // Auto-open when link token arrives
  useEffect(() => {
    if (linkToken && isMergeLinkReady) {
      openMergeLink();
    }
  }, [linkToken, isMergeLinkReady, openMergeLink]);

  // Save settings
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !integration) throw new Error("No integration to update");
      const { error } = await supabase
        .from("hris_integrations")
        .update({
          sync_interval_hours: parseInt(syncInterval),
          field_mappings: mappings,
        })
        .eq("id", integration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["hris-integration"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Disconnect
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!integration) return;
      const { error } = await supabase.from("hris_integrations").delete().eq("id", integration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("HRIS disconnected");
      setMappings(EMPTY_MAPPINGS);
      queryClient.invalidateQueries({ queryKey: ["hris-integration"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Manual sync
  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("merge-sync", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.warning === "no_employees") {
        toast.warning(data.message || "Sync returned 0 employees. The initial data pull may still be in progress.");
      } else {
        toast.success(
          `Sync complete: ${data.users_created} created, ${data.users_updated} updated, ${data.users_deactivated} deactivated`
        );
      }
      queryClient.invalidateQueries({ queryKey: ["hris-sync-logs"] });
      queryClient.invalidateQueries({ queryKey: ["hris-integration"] });
    },
    onError: (e: any) => toast.error(`Sync failed: ${e.message}`),
  });

  // Send claim emails
  const claimEmailsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("send-claim-emails", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Sent ${data.sent} invite email(s), ${data.skipped} already claimed.`);
    },
    onError: (e: any) => toast.error(`Failed to send emails: ${e.message}`),
  });

  const addRoleMapping = () => {
    if (!newRoleKey) return;
    setMappings((m) => ({ ...m, role_mapping: { ...m.role_mapping, [newRoleKey]: newRoleValue } }));
    setNewRoleKey("");
  };

  const addLocationMapping = () => {
    if (!newLocKey || !newLocValue) return;
    setMappings((m) => ({ ...m, location_mapping: { ...m.location_mapping, [newLocKey]: newLocValue } }));
    setNewLocKey("");
    setNewLocValue("");
  };

  const addCustomRoleMapping = () => {
    if (!newCrKey || !newCrValue) return;
    setMappings((m) => ({ ...m, custom_role_mapping: { ...m.custom_role_mapping, [newCrKey]: newCrValue } }));
    setNewCrKey("");
    setNewCrValue("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">Connect your HRIS to automatically sync employees.</p>
      </div>

      {/* Connection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            HRIS Connection
          </CardTitle>
          <CardDescription>
            Connect to BambooHR, Workday, ADP, Gusto, and 50+ other HRIS platforms in one click.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {integration ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="default">Connected</Badge>
                {integration.last_synced_at && (
                  <span className="text-sm text-muted-foreground">
                    Last synced: {format(new Date(integration.last_synced_at), "PPp")}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  {syncMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Sync Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => claimEmailsMutation.mutate()}
                  disabled={claimEmailsMutation.isPending}
                >
                  {claimEmailsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Mail className="h-4 w-4 mr-1" />
                  )}
                  Send Claim Emails
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    startConnect();
                  }}
                  disabled={isConnecting}
                >
                  Reconnect
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Plug className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No HRIS connected</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Click below to choose your HRIS provider and connect in seconds.
                </p>
              </div>
              <Button
                onClick={linkToken && isMergeLinkReady ? handleOpenMergeLink : startConnect}
                disabled={isConnecting}
                size="lg"
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plug className="h-4 w-4 mr-2" />
                )}
                Connect HRIS
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Only show settings if connected */}
      {integration && (
        <>
          {/* Sync Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Sync Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Sync Frequency</Label>
                <Select value={syncInterval} onValueChange={setSyncInterval}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Every hour</SelectItem>
                    <SelectItem value="6">Every 6 hours</SelectItem>
                    <SelectItem value="12">Every 12 hours</SelectItem>
                    <SelectItem value="24">Daily</SelectItem>
                    <SelectItem value="168">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Default Role</Label>
                <Select
                  value={mappings.default_role}
                  onValueChange={(v) => setMappings((m) => ({ ...m, default_role: v }))}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Role assigned to employees that don't match any mapping rule.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Field Mappings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Field Mappings</CardTitle>
                  <CardDescription>
                    Map HRIS department/job title values to roles, locations, and custom roles.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchHrisFields()}
                  disabled={hrisFieldsLoading}
                >
                  {hrisFieldsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Refresh HRIS Fields
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {hrisFieldsLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading departments and locations from your HRIS...
                </div>
              )}
              {!hrisFieldsLoading && hrisDeptOptions.length === 0 && integration && (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  Click "Refresh HRIS Fields" to load departments and locations from your HRIS for dropdown selection.
                </p>
              )}
              {/* Role Mappings */}
              <div>
                <h3 className="font-semibold mb-2">Department → Role</h3>
                <div className="space-y-2">
                  {Object.entries(mappings.role_mapping).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Badge variant="secondary">{key}</Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge>{value}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          const updated = { ...mappings.role_mapping };
                          delete updated[key];
                          setMappings((m) => ({ ...m, role_mapping: updated }));
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Select value={newRoleKey} onValueChange={setNewRoleKey} disabled={hrisFieldsLoading}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder={hrisFieldsLoading ? "Loading..." : hrisDeptOptions.length === 0 ? "No departments found" : "Select department"} />
                      </SelectTrigger>
                      <SelectContent>
                        {hrisDeptOptions.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={newRoleValue} onValueChange={setNewRoleValue}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={addRoleMapping}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Location Mappings */}
              <div>
                <h3 className="font-semibold mb-2">Work Location → Location</h3>
                <div className="space-y-2">
                  {Object.entries(mappings.location_mapping).map(([key, value]) => {
                    const loc = locations?.find((l) => l.id === value);
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <Badge variant="secondary">{key}</Badge>
                        <span className="text-muted-foreground">→</span>
                        <Badge>{loc?.name || value}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            const updated = { ...mappings.location_mapping };
                            delete updated[key];
                            setMappings((m) => ({ ...m, location_mapping: updated }));
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2">
                    <Select value={newLocKey} onValueChange={setNewLocKey} disabled={hrisFieldsLoading}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder={hrisFieldsLoading ? "Loading..." : (hrisFields?.work_locations || []).length === 0 ? "No locations found" : "Select HRIS location"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(hrisFields?.work_locations || []).map((wl) => (
                          <SelectItem key={wl} value={wl}>{wl}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={newLocValue} onValueChange={setNewLocValue}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations?.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={addLocationMapping}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Custom Role Mappings */}
              <div>
                <h3 className="font-semibold mb-2">Department → Custom Role</h3>
                <div className="space-y-2">
                  {Object.entries(mappings.custom_role_mapping).map(([key, value]) => {
                    const cr = customRoles?.find((r) => r.id === value);
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <Badge variant="secondary">{key}</Badge>
                        <span className="text-muted-foreground">→</span>
                        <Badge>{cr?.name || value}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            const updated = { ...mappings.custom_role_mapping };
                            delete updated[key];
                            setMappings((m) => ({ ...m, custom_role_mapping: updated }));
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2">
                    <Select value={newCrKey} onValueChange={setNewCrKey} disabled={hrisFieldsLoading}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder={hrisFieldsLoading ? "Loading..." : hrisDeptOptions.length === 0 ? "No departments found" : "Select department"} />
                      </SelectTrigger>
                      <SelectContent>
                        {hrisDeptOptions.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={newCrValue} onValueChange={setNewCrValue}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select custom role" />
                      </SelectTrigger>
                      <SelectContent>
                        {customRoles?.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={addCustomRoleMapping}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save Settings
            </Button>
          </div>

          {/* Bulk Apply Mappings */}
          <BulkMappingPreview companyId={companyId!} queryClient={queryClient} />

          {/* Sync History */}
          {syncLogs && syncLogs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Sync History</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead>Deactivated</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">
                          {format(new Date(log.started_at), "PPp")}
                        </TableCell>
                        <TableCell>
                          {log.status === "success" && (
                            <Badge variant="default">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Success
                            </Badge>
                          )}
                          {log.status === "error" && (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" /> Error
                            </Badge>
                          )}
                          {log.status === "running" && (
                            <Badge variant="secondary">
                              <Clock className="h-3 w-3 mr-1" /> Running
                            </Badge>
                          )}
                          {log.status === "warning" && (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">
                              <XCircle className="h-3 w-3 mr-1" /> Warning
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{log.users_created}</TableCell>
                        <TableCell className="tabular-nums">{log.users_updated}</TableCell>
                        <TableCell className="tabular-nums">{log.users_deactivated}</TableCell>
                        <TableCell className="text-sm text-destructive max-w-[200px] truncate">
                          {log.error_message || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
