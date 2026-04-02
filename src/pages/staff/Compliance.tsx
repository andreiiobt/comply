import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft, Shield, FileText, Check, Search, Plus, Upload, Trash2,
  AlertTriangle, Clock, ExternalLink, Calendar, ChevronDown, ChevronUp,
  Award, Download, File, Image as ImageIcon
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, isPast, differenceInDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";

type Policy = {
  id: string;
  title: string;
  body: string;
  agreement_mode: "manual" | "auto";
  version: number;
  is_published: boolean;
  updated_at: string;
};

type PolicyAgreement = {
  id: string;
  policy_id: string;
  policy_version: number;
  agreed_at: string;
};

type PolicyDocument = {
  id: string;
  policy_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function policyFileIcon(type: string) {
  if (type === "application/pdf") return <File className="h-3.5 w-3.5 text-red-500" />;
  if (type.startsWith("image/")) return <ImageIcon className="h-3.5 w-3.5 text-blue-500" />;
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
}

type UserLicense = {
  id: string;
  license_name: string;
  license_number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  document_url: string | null;
  status: "active" | "expired" | "pending";
  created_at: string;
};

const defaultLicenseForm = {
  license_name: "",
  license_number: "",
  issued_at: "",
  expires_at: "",
};

export default function StaffCompliance() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [policySearch, setPolicySearch] = useState("");
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);
  const [readingPolicy, setReadingPolicy] = useState<Policy | null>(null);
  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false);
  const [licenseForm, setLicenseForm] = useState(defaultLicenseForm);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Fetch published policies for this company
  const { data: policies = [], isLoading: loadingPolicies } = useQuery<Policy[]>({
    queryKey: ["staff-policies", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("policies")
        .select("id, title, body, agreement_mode, version, is_published, updated_at")
        .eq("company_id", profile!.company_id)
        .eq("is_published", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Policy[];
    },
    enabled: !!profile?.company_id,
  });

  // Fetch my agreements
  const { data: myAgreements = [] } = useQuery<PolicyAgreement[]>({
    queryKey: ["my-policy-agreements", user?.id],
    queryFn: async () => {
      const pIds = policies.map((p) => p.id);
      if (!pIds.length) return [];
      const { data, error } = await (supabase as any)
        .from("policy_agreements")
        .select("id, policy_id, policy_version, agreed_at")
        .eq("user_id", user!.id)
        .in("policy_id", pIds);
      if (error) throw error;
      return (data || []) as PolicyAgreement[];
    },
    enabled: policies.length > 0 && !!user?.id,
  });

  // Fetch policy documents
  const { data: policyDocuments = [] } = useQuery<PolicyDocument[]>({
    queryKey: ["staff-policy-documents", profile?.company_id],
    queryFn: async () => {
      const pIds = policies.map((p) => p.id);
      if (!pIds.length) return [];
      const { data, error } = await (supabase as any)
        .from("policy_documents")
        .select("id, policy_id, file_name, file_url, file_type, file_size")
        .in("policy_id", pIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as PolicyDocument[];
    },
    enabled: policies.length > 0,
  });

  const getDocsForPolicy = (policyId: string) =>
    policyDocuments.filter((d) => d.policy_id === policyId);

  // Fetch my licenses
  const { data: licenses = [], isLoading: loadingLicenses } = useQuery<UserLicense[]>({
    queryKey: ["my-licenses", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_licenses")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as UserLicense[];
    },
    enabled: !!user?.id,
  });

  const agreeMutation = useMutation({
    mutationFn: async (policy: Policy) => {
      const { error } = await (supabase as any).from("policy_agreements").upsert({
        policy_id: policy.id,
        user_id: user!.id,
        policy_version: policy.version,
        agreed_at: new Date().toISOString(),
      }, { onConflict: "policy_id,user_id,policy_version" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-policy-agreements"] });
      toast.success("Agreement recorded ✓");
      setReadingPolicy(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLicenseMutation = useMutation({
    mutationFn: async (url: string | null) => {
      const { error } = await (supabase as any).from("user_licenses").insert({
        user_id: user!.id,
        company_id: profile!.company_id,
        license_name: licenseForm.license_name,
        license_number: licenseForm.license_number || null,
        issued_at: licenseForm.issued_at || null,
        expires_at: licenseForm.expires_at || null,
        document_url: url,
        status: licenseForm.expires_at && isPast(new Date(licenseForm.expires_at)) ? "expired" : "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-licenses"] });
      toast.success("License added");
      setLicenseDialogOpen(false);
      setLicenseForm(defaultLicenseForm);
      setUploadFile(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLicenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("user_licenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-licenses"] });
      toast.success("License removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleAddLicense = async () => {
    if (!licenseForm.license_name.trim()) return toast.error("License name is required");
    setUploading(true);
    let url: string | null = null;
    try {
      if (uploadFile && user) {
        if (uploadFile.size > 10 * 1024 * 1024) {
          toast.error("File is too large. Maximum size is 10MB.");
          return;
        }
        const ext = uploadFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("user-licenses")
          .upload(path, uploadFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("user-licenses").getPublicUrl(path);
        url = urlData?.publicUrl || null;
      }
      await addLicenseMutation.mutateAsync(url);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const getPolicyStatus = (policy: Policy) => {
    const agreed = myAgreements.find(
      (a) => a.policy_id === policy.id && a.policy_version === policy.version
    );
    return agreed ? "agreed" : "pending";
  };

  const filteredPolicies = policies.filter((p) =>
    p.title.toLowerCase().includes(policySearch.toLowerCase())
  );

  const needActionPolicies = filteredPolicies.filter(
    (p) => getPolicyStatus(p) === "pending" && p.agreement_mode === "manual"
  );
  const donePolicies = filteredPolicies.filter((p) => getPolicyStatus(p) === "agreed");

  const expiringLicenses = licenses.filter((l) => {
    if (!l.expires_at) return false;
    const daysLeft = differenceInDays(new Date(l.expires_at), new Date());
    return daysLeft >= 0 && daysLeft <= 30;
  });

  const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={() => navigate("/home")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-display font-bold">Compliance</h1>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Expiring license alert */}
        {expiringLicenses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-3"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              <strong>{expiringLicenses.length} license{expiringLicenses.length > 1 ? "s" : ""}</strong> expiring within 30 days.
            </p>
          </motion.div>
        )}

        <Tabs defaultValue="policies" className="space-y-4">
          <TabsList className="w-full rounded-xl">
            <TabsTrigger value="policies" className="flex-1 rounded-lg gap-1.5">
              <Shield className="h-4 w-4" /> Policies
              {needActionPolicies.length > 0 && (
                <Badge className="ml-1 h-4 text-[10px] px-1">{needActionPolicies.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="licenses" className="flex-1 rounded-lg gap-1.5">
              <Award className="h-4 w-4" /> My Licenses
            </TabsTrigger>
          </TabsList>

          {/* === POLICIES TAB === */}
          <TabsContent value="policies" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search policies…"
                value={policySearch}
                onChange={(e) => setPolicySearch(e.target.value)}
                className="pl-9 rounded-xl h-10 text-sm"
              />
            </div>

            {loadingPolicies ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : filteredPolicies.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No policies published yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Needs action */}
                {needActionPolicies.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Action Required</p>
                    {needActionPolicies.map((policy, i) => (
                      <PolicyRow
                        key={policy.id}
                        policy={policy}
                        status="pending"
                        documents={getDocsForPolicy(policy.id)}
                        expanded={expandedPolicy === policy.id}
                        onToggle={() => setExpandedPolicy(expandedPolicy === policy.id ? null : policy.id)}
                        onAgree={() => setReadingPolicy(policy)}
                        i={i}
                        ease={ease}
                      />
                    ))}
                  </div>
                )}

                {/* Done */}
                {donePolicies.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Agreed</p>
                    {donePolicies.map((policy, i) => {
                      const agr = myAgreements.find((a) => a.policy_id === policy.id && a.policy_version === policy.version);
                      return (
                        <PolicyRow
                          key={policy.id}
                          policy={policy}
                          status="agreed"
                          agreedAt={agr?.agreed_at}
                          documents={getDocsForPolicy(policy.id)}
                          expanded={expandedPolicy === policy.id}
                          onToggle={() => setExpandedPolicy(expandedPolicy === policy.id ? null : policy.id)}
                          i={i}
                          ease={ease}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Auto-agree policies */}
                {filteredPolicies
                  .filter((p) => p.agreement_mode === "auto" && getPolicyStatus(p) === "pending")
                  .map((policy) => (
                    <PolicyRow
                      key={policy.id}
                      policy={policy}
                      status="auto"
                      documents={getDocsForPolicy(policy.id)}
                      expanded={expandedPolicy === policy.id}
                      onToggle={() => setExpandedPolicy(expandedPolicy === policy.id ? null : policy.id)}
                      i={0}
                      ease={ease}
                    />
                  ))}
              </div>
            )}
          </TabsContent>

          {/* === LICENSES TAB === */}
          <TabsContent value="licenses" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setLicenseDialogOpen(true)} className="rounded-xl gap-2" size="sm">
                <Plus className="h-4 w-4" /> Add License
              </Button>
            </div>

            {loadingLicenses ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}
              </div>
            ) : licenses.length === 0 ? (
              <div className="py-12 text-center">
                <Award className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-3">No licenses added yet.</p>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setLicenseDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add your first license
                </Button>
              </div>
            ) : (
              <motion.div className="space-y-3" initial="hidden" animate="show">
                {licenses.map((lic, i) => {
                  const expired = lic.expires_at && isPast(new Date(lic.expires_at));
                  const daysLeft = lic.expires_at ? differenceInDays(new Date(lic.expires_at), new Date()) : null;
                  const expiring = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;
                  return (
                    <motion.div
                      key={lic.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.4, ease }}
                    >
                      <Card className="rounded-2xl">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-display font-semibold text-sm truncate">{lic.license_name}</p>
                              {lic.license_number && (
                                <p className="text-xs text-muted-foreground font-mono"># {lic.license_number}</p>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-[10px] ${
                                expired
                                  ? "border-destructive text-destructive"
                                  : expiring
                                  ? "border-amber-500 text-amber-600"
                                  : "border-green-500 text-green-600"
                              }`}
                            >
                              {expired ? "Expired" : expiring ? `Expires in ${daysLeft}d` : "Active"}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            {lic.issued_at && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" /> Issued {format(new Date(lic.issued_at), "MMM d, yyyy")}
                              </span>
                            )}
                            {lic.expires_at && (
                              <span className={`flex items-center gap-1 ${expired ? "text-destructive" : expiring ? "text-amber-600" : ""}`}>
                                <Clock className="h-3 w-3" /> Expires {format(new Date(lic.expires_at), "MMM d, yyyy")}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {lic.document_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-lg text-xs gap-1"
                                onClick={() => window.open(lic.document_url!, "_blank")}
                              >
                                <ExternalLink className="h-3 w-3" /> View Document
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 rounded-lg text-xs gap-1 text-destructive hover:text-destructive ml-auto"
                              onClick={() => {
                                if (confirm("Remove this license?")) deleteLicenseMutation.mutate(lic.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" /> Remove
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Policy Reading Dialog (for manual agree) */}
      <Dialog open={!!readingPolicy} onOpenChange={(o) => !o && setReadingPolicy(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] flex flex-col rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display pr-4">{readingPolicy?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 pr-1">
            <div className="prose prose-sm w-full max-w-full text-foreground [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:break-words [&_p]:break-words">
              <ReactMarkdown>{readingPolicy?.body || ""}</ReactMarkdown>
            </div>
            {readingPolicy && getDocsForPolicy(readingPolicy.id).length > 0 && (
              <div className="mt-4 pt-3 border-t space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attachments</p>
                <div className="flex flex-wrap gap-2">
                  {getDocsForPolicy(readingPolicy.id).map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                    >
                      {policyFileIcon(doc.file_type)}
                      <span className="truncate max-w-[140px]">{doc.file_name}</span>
                      <span className="text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                      <Download className="h-3 w-3 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row pt-4 border-t">
            <p className="text-xs text-muted-foreground flex-1">
              By clicking agree, you confirm you have read and understood this policy.
            </p>
            <Button
              className="rounded-xl gap-2"
              onClick={() => readingPolicy && agreeMutation.mutate(readingPolicy)}
              disabled={agreeMutation.isPending}
            >
              <Check className="h-4 w-4" />
              {agreeMutation.isPending ? "Recording…" : "I Agree"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add License Dialog */}
      <Dialog open={licenseDialogOpen} onOpenChange={(o) => { setLicenseDialogOpen(o); if (!o) { setLicenseForm(defaultLicenseForm); setUploadFile(null); } }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Add License / Certification</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>License Name *</Label>
              <Input
                placeholder="e.g. RSA Certificate, Food Handling"
                value={licenseForm.license_name}
                onChange={(e) => setLicenseForm((f) => ({ ...f, license_name: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>License Number</Label>
              <Input
                placeholder="e.g. RSA-12345678"
                value={licenseForm.license_number}
                onChange={(e) => setLicenseForm((f) => ({ ...f, license_number: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date Issued</Label>
                <Input
                  type="date"
                  value={licenseForm.issued_at}
                  onChange={(e) => setLicenseForm((f) => ({ ...f, issued_at: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={licenseForm.expires_at}
                  onChange={(e) => setLicenseForm((f) => ({ ...f, expires_at: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
            </div>

            {/* Document upload */}
            <div className="space-y-1.5">
              <Label>Document (PDF or Image, Max 10MB)</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl gap-2 border-dashed"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {uploadFile ? uploadFile.name : "Upload document"}
              </Button>
              {uploadFile && (
                <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024).toFixed(1)} KB</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setLicenseDialogOpen(false)}>Cancel</Button>
            <Button className="rounded-xl" onClick={handleAddLicense} disabled={uploading || addLicenseMutation.isPending}>
              {uploading ? "Uploading…" : "Save License"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Policy Row Sub-component ─────────────────────────────────────────────────
function PolicyRow({
  policy,
  status,
  agreedAt,
  documents = [],
  expanded,
  onToggle,
  onAgree,
  i,
  ease,
}: {
  policy: Policy;
  status: "pending" | "agreed" | "auto";
  agreedAt?: string;
  documents?: PolicyDocument[];
  expanded: boolean;
  onToggle: () => void;
  onAgree?: () => void;
  i: number;
  ease: [number, number, number, number];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05, duration: 0.4, ease }}
    >
      <Card className="rounded-2xl overflow-hidden">
        <div
          className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={onToggle}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                status === "agreed"
                  ? "bg-primary/10"
                  : status === "auto"
                  ? "bg-muted"
                  : "bg-amber-50 dark:bg-amber-950/30"
              }`}
            >
              {status === "agreed" ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-display font-semibold truncate">{policy.title}</p>
              <p className="text-[10px] text-muted-foreground">
                {status === "agreed" && agreedAt
                  ? `Agreed ${format(new Date(agreedAt), "MMM d, yyyy")}`
                  : status === "auto"
                  ? "Auto-agreed"
                  : `Updated ${format(new Date(policy.updated_at), "MMM d, yyyy")}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {status === "pending" && onAgree && (
              <Button
                size="sm"
                className="h-7 rounded-lg text-xs px-2.5"
                onClick={(e) => { e.stopPropagation(); onAgree(); }}
              >
                Read & Agree
              </Button>
            )}
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-t px-4 py-3">
                <div className="overflow-y-auto overflow-x-hidden max-h-72">
                  <div className="prose prose-sm w-full max-w-full text-foreground [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:break-words [&_p]:break-words">
                    <ReactMarkdown>{policy.body || "*No content.*"}</ReactMarkdown>
                  </div>
                </div>
                {documents.length > 0 && (
                  <div className="mt-3 pt-2 border-t space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Attachments</p>
                    <div className="flex flex-wrap gap-1.5">
                      {documents.map((doc) => (
                        <a
                          key={doc.id}
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] hover:bg-muted/50 transition-colors"
                        >
                          {policyFileIcon(doc.file_type)}
                          <span className="truncate max-w-[120px]">{doc.file_name}</span>
                          <Download className="h-3 w-3 text-muted-foreground" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {status === "pending" && onAgree && (
                  <Button size="sm" className="mt-3 rounded-xl gap-1.5 w-full" onClick={onAgree}>
                    <Check className="h-4 w-4" /> Read & Agree
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
