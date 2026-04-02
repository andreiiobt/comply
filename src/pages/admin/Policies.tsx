import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  FileText, Plus, Search, Users, Check, Eye, Edit2, Trash2, RefreshCw,
  ChevronDown, ChevronUp, Shield, Clock, Upload, X, Download, History,
  File, Image as ImageIcon
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import { MarkdownEditor } from "@/components/MarkdownEditor";

type Policy = {
  id: string;
  company_id: string;
  title: string;
  body: string;
  agreement_mode: "manual" | "auto";
  version: number;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type PolicyAgreement = {
  id: string;
  policy_id: string;
  user_id: string;
  agreed_at: string;
  policy_version: number;
};

type PolicyDocument = {
  id: string;
  policy_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
};

type PolicyVersion = {
  id: string;
  policy_id: string;
  version: number;
  title: string;
  body: string;
  documents: { file_name: string; file_url: string; file_type: string; file_size: number }[];
  changed_by: string | null;
  created_at: string;
};

type PendingFile = {
  id: string; // temp id for UI
  file: File;
};

const defaultForm = {
  title: "",
  body: "",
  agreement_mode: "manual" as "manual" | "auto",
  is_published: false,
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type === "application/pdf") return <File className="h-4 w-4 text-red-500" />;
  if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-blue-500" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

export default function AdminPolicies() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [agreementsTarget, setAgreementsTarget] = useState<Policy | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Policy | null>(null);
  // Document management in create/edit dialog
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [existingDocs, setExistingDocs] = useState<PolicyDocument[]>([]);
  const [docsToRemove, setDocsToRemove] = useState<string[]>([]);

  const { data: policies = [], isLoading } = useQuery<Policy[]>({
    queryKey: ["admin-policies", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("policies")
        .select("*")
        .eq("company_id", profile!.company_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Policy[];
    },
    enabled: !!profile?.company_id,
  });

  const { data: agreements = [] } = useQuery<PolicyAgreement[]>({
    queryKey: ["admin-policy-agreements", profile?.company_id],
    queryFn: async () => {
      const policyIds = policies.map((p) => p.id);
      if (!policyIds.length) return [];
      const { data, error } = await (supabase as any)
        .from("policy_agreements")
        .select("*")
        .in("policy_id", policyIds);
      if (error) throw error;
      return (data || []) as PolicyAgreement[];
    },
    enabled: policies.length > 0,
  });

  // Fetch all policy documents
  const { data: allDocuments = [] } = useQuery<PolicyDocument[]>({
    queryKey: ["admin-policy-documents", profile?.company_id],
    queryFn: async () => {
      const policyIds = policies.map((p) => p.id);
      if (!policyIds.length) return [];
      const { data, error } = await (supabase as any)
        .from("policy_documents")
        .select("*")
        .in("policy_id", policyIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as PolicyDocument[];
    },
    enabled: policies.length > 0,
  });

  // Fetch version history for selected policy
  const { data: versionHistory = [] } = useQuery<PolicyVersion[]>({
    queryKey: ["policy-versions", historyTarget?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("policy_versions")
        .select("*")
        .eq("policy_id", historyTarget!.id)
        .order("version", { ascending: false });
      if (error) throw error;
      return (data || []) as PolicyVersion[];
    },
    enabled: !!historyTarget,
  });

  // Resolve user names for agreements and version history
  const agreementUserIds = useMemo(() => [...new Set(agreements.map((a) => a.user_id))], [agreements]);
  const versionUserIds = useMemo(() => [...new Set(versionHistory.filter((v) => v.changed_by).map((v) => v.changed_by!))], [versionHistory]);
  const allUserIds = useMemo(() => [...new Set([...agreementUserIds, ...versionUserIds])], [agreementUserIds, versionUserIds]);

  const { data: userProfiles = [] } = useQuery({
    queryKey: ["policy-user-profiles", allUserIds],
    queryFn: async () => {
      if (!allUserIds.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", allUserIds);
      return (data || []) as { user_id: string; full_name: string | null }[];
    },
    enabled: allUserIds.length > 0,
  });
  const userMap = useMemo(() => {
    const m: Record<string, string> = {};
    userProfiles.forEach((p) => { m[p.user_id] = p.full_name || "Unknown"; });
    return m;
  }, [userProfiles]);

  const { data: userCount = 0 } = useQuery<number>({
    queryKey: ["staff-count", profile?.company_id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("company_id", profile!.company_id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!profile?.company_id,
  });

  const upsertMutation = useMutation({
    mutationFn: async (data: typeof form & { id?: string; version?: number }) => {
      const isEdit = !!data.id;
      const existing = isEdit ? policies.find((p) => p.id === data.id) : null;
      const currentDocs = existing ? allDocuments.filter((d) => d.policy_id === existing.id) : [];
      const bodyChanged = existing && existing.body !== data.body;
      const docsChanged = docsToRemove.length > 0 || pendingFiles.length > 0;
      const shouldBumpVersion = isEdit && (bodyChanged || docsChanged);

      // If editing and content changed, snapshot current version first
      if (shouldBumpVersion && existing) {
        const docSnapshots = currentDocs
          .filter((d) => !docsToRemove.includes(d.id))
          .map((d) => ({ file_name: d.file_name, file_url: d.file_url, file_type: d.file_type, file_size: d.file_size }));

        await (supabase as any).from("policy_versions").insert({
          policy_id: existing.id,
          version: existing.version,
          title: existing.title,
          body: existing.body,
          documents: docSnapshots,
          changed_by: profile!.user_id,
        });
      }

      let policyId: string;

      if (isEdit) {
        const { error } = await (supabase as any)
          .from("policies")
          .update({
            title: data.title,
            body: data.body,
            agreement_mode: data.agreement_mode,
            is_published: data.is_published,
            ...(shouldBumpVersion ? { version: (existing!.version || 1) + 1 } : {}),
          })
          .eq("id", data.id);
        if (error) throw error;
        policyId = data.id!;
      } else {
        const { data: inserted, error } = await (supabase as any)
          .from("policies")
          .insert({
            company_id: profile!.company_id,
            title: data.title,
            body: data.body,
            agreement_mode: data.agreement_mode,
            is_published: data.is_published,
            created_by: profile!.user_id,
          })
          .select("id")
          .single();
        if (error) throw error;
        policyId = inserted.id;
      }

      // Remove deleted docs from DB
      if (docsToRemove.length > 0) {
        await (supabase as any)
          .from("policy_documents")
          .delete()
          .in("id", docsToRemove);
      }

      // Upload new files
      for (const pf of pendingFiles) {
        const ext = pf.file.name.split(".").pop() || "bin";
        const storagePath = `${profile!.company_id}/${policyId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("policy-documents")
          .upload(storagePath, pf.file, { upsert: false });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("policy-documents").getPublicUrl(storagePath);

        await (supabase as any).from("policy_documents").insert({
          policy_id: policyId,
          file_name: pf.file.name,
          file_url: urlData.publicUrl,
          file_type: pf.file.type,
          file_size: pf.file.size,
          uploaded_by: profile!.user_id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-policies"] });
      qc.invalidateQueries({ queryKey: ["admin-policy-documents"] });
      toast.success(editingPolicy ? "Policy updated" : "Policy created");
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("policies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-policies"] });
      qc.invalidateQueries({ queryKey: ["admin-policy-documents"] });
      toast.success("Policy deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, is_published }: { id: string; is_published: boolean }) => {
      const { error } = await (supabase as any).from("policies").update({ is_published }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-policies"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingPolicy(null);
    setForm(defaultForm);
    setPendingFiles([]);
    setExistingDocs([]);
    setDocsToRemove([]);
  };

  const openCreate = () => {
    setEditingPolicy(null);
    setForm(defaultForm);
    setPendingFiles([]);
    setExistingDocs([]);
    setDocsToRemove([]);
    setDialogOpen(true);
  };

  const openEdit = (p: Policy) => {
    setEditingPolicy(p);
    setForm({ title: p.title, body: p.body, agreement_mode: p.agreement_mode, is_published: p.is_published });
    const docs = allDocuments.filter((d) => d.policy_id === p.id);
    setExistingDocs(docs);
    setPendingFiles([]);
    setDocsToRemove([]);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim()) return toast.error("Title is required");
    upsertMutation.mutate({ ...form, ...(editingPolicy ? { id: editingPolicy.id } : {}) });
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    const newFiles: PendingFile[] = [];
    for (const f of Array.from(files)) {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} exceeds 10MB limit`);
        continue;
      }
      if (!allowed.includes(f.type)) {
        toast.error(`${f.name} is not a supported file type (PDF or image)`);
        continue;
      }
      newFiles.push({ id: crypto.randomUUID(), file: f });
    }
    setPendingFiles((prev) => [...prev, ...newFiles]);
  };

  const filtered = policies.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.body.toLowerCase().includes(search.toLowerCase())
  );

  const getAgreementRate = (policy: Policy) => {
    const agreed = agreements.filter(
      (a) => a.policy_id === policy.id && a.policy_version === policy.version
    ).length;
    if (!userCount) return { agreed, rate: 0 };
    return { agreed, rate: Math.round((agreed / userCount) * 100) };
  };

  const getDocsForPolicy = (policyId: string) =>
    allDocuments.filter((d) => d.policy_id === policyId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Policies</h1>
          <p className="text-muted-foreground">Create and manage company compliance policies</p>
        </div>
        <Button onClick={openCreate} className="gap-2 rounded-xl">
          <Plus className="h-4 w-4" /> New Policy
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Policies", value: policies.length, icon: FileText, color: "text-primary" },
          { label: "Published", value: policies.filter((p) => p.is_published).length, icon: Eye, color: "text-green-500" },
          { label: "Staff Members", value: userCount, icon: Users, color: "text-muted-foreground" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <Card className="rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-display font-bold">{s.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search policies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-xl"
        />
      </div>

      {/* Policies List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="rounded-2xl animate-pulse">
              <CardContent className="h-20 p-6" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center py-16">
            <Shield className="h-10 w-10 text-muted-foreground/30 mb-4" />
            <p className="font-display font-semibold">No policies yet</p>
            <p className="text-sm text-muted-foreground mb-4">Create your first compliance policy to get started.</p>
            <Button onClick={openCreate} variant="outline" className="rounded-xl">
              <Plus className="h-4 w-4 mr-2" /> Create Policy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map((policy, i) => {
              const { agreed, rate } = getAgreementRate(policy);
              const docs = getDocsForPolicy(policy.id);
              const isExpanded = expanded === policy.id;
              return (
                <motion.div
                  key={policy.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Card className="rounded-2xl overflow-hidden">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpanded(isExpanded ? null : policy.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${policy.is_published ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                        <div className="min-w-0">
                          <p className="font-display font-semibold text-sm truncate">{policy.title}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="text-[10px] text-muted-foreground">v{policy.version}</span>
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                              {policy.agreement_mode === "manual" ? "Manual sign-off" : "Auto-agree"}
                            </Badge>
                            {docs.length > 0 && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-1">
                                <FileText className="h-2.5 w-2.5" /> {docs.length} doc{docs.length !== 1 ? "s" : ""}
                              </Badge>
                            )}
                            {policy.is_published && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Users className="h-3 w-3" /> {agreed}/{userCount} agreed ({rate}%)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <Button
                          size="sm"
                          variant={policy.is_published ? "secondary" : "default"}
                          className="rounded-lg text-xs h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePublish.mutate({ id: policy.id, is_published: !policy.is_published });
                          }}
                        >
                          {policy.is_published ? "Unpublish" : "Publish"}
                        </Button>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="border-t px-4 py-4 space-y-4">
                            {/* Markdown preview */}
                            <div className="prose prose-sm max-w-none text-foreground rounded-xl bg-muted/30 p-4 max-h-60 overflow-y-auto">
                              <ReactMarkdown>{policy.body || "*No content yet.*"}</ReactMarkdown>
                            </div>

                            {/* Attached documents */}
                            {docs.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attached Documents</p>
                                <div className="flex flex-wrap gap-2">
                                  {docs.map((doc) => (
                                    <a
                                      key={doc.id}
                                      href={doc.file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                                    >
                                      {fileIcon(doc.file_type)}
                                      <span className="truncate max-w-[160px]">{doc.file_name}</span>
                                      <span className="text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                                      <Download className="h-3 w-3 text-muted-foreground" />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Agreement progress bar */}
                            {policy.is_published && (
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Agreement rate (v{policy.version})</span>
                                  <span>{rate}%</span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <motion.div
                                    className="h-full bg-primary rounded-full"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${rate}%` }}
                                    transition={{ duration: 0.6, ease: "easeOut" }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button size="sm" variant="outline" className="rounded-lg gap-1.5 h-8" onClick={() => openEdit(policy)}>
                                <Edit2 className="h-3.5 w-3.5" /> Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-lg gap-1.5 h-8"
                                onClick={() => setAgreementsTarget(policy)}
                              >
                                <Users className="h-3.5 w-3.5" /> View Agreements
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-lg gap-1.5 h-8"
                                onClick={() => setHistoryTarget(policy)}
                              >
                                <History className="h-3.5 w-3.5" /> History
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-lg gap-1.5 h-8 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm("Delete this policy? This cannot be undone.")) {
                                    deleteMutation.mutate(policy.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </Button>
                              <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Updated {format(new Date(policy.updated_at), "MMM d, yyyy")}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">{editingPolicy ? "Edit Policy" : "New Policy"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                placeholder="e.g. Food Safety Handling Policy"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            {/* Agreement mode */}
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Agreement Mode</p>
                <p className="text-xs text-muted-foreground">
                  {form.agreement_mode === "manual"
                    ? "Staff must manually read and click agree"
                    : "Staff are auto-agreed when policy is published"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{form.agreement_mode === "manual" ? "Manual" : "Auto"}</span>
                <Switch
                  checked={form.agreement_mode === "auto"}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, agreement_mode: v ? "auto" : "manual" }))}
                />
              </div>
            </div>

            {/* Body editor */}
            <div className="space-y-1.5">
              <Label>Policy Content</Label>
              <MarkdownEditor
                value={form.body}
                onChange={(md) => setForm((f) => ({ ...f, body: md }))}
                placeholder="## Overview&#10;&#10;Write your policy content here, or use the Import doc button to upload a PDF, Word, or text file..."
                minHeight="320px"
              />
            </div>

            {/* Document uploads */}
            <div className="space-y-2">
              <Label>Attachments (PDF or Images)</Label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { handleFileSelect(e.target.files); e.target.value = ""; }}
              />
              <div
                className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFileSelect(e.dataTransfer.files); }}
              >
                <Upload className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
                <p className="text-sm text-muted-foreground">
                  Drop files here or <span className="text-primary font-medium">browse</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">PDF, JPEG, PNG, WebP up to 10MB each</p>
              </div>

              {/* Existing docs (when editing) */}
              {existingDocs.filter((d) => !docsToRemove.includes(d.id)).length > 0 && (
                <div className="space-y-1.5">
                  {existingDocs
                    .filter((d) => !docsToRemove.includes(d.id))
                    .map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                        {fileIcon(doc.file_type)}
                        <span className="truncate flex-1">{doc.file_name}</span>
                        <span className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setDocsToRemove((prev) => [...prev, doc.id])}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                </div>
              )}

              {/* Pending files (new uploads) */}
              {pendingFiles.length > 0 && (
                <div className="space-y-1.5">
                  {pendingFiles.map((pf) => (
                    <div key={pf.id} className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                      {fileIcon(pf.file.type)}
                      <span className="truncate flex-1">{pf.file.name}</span>
                      <span className="text-xs text-muted-foreground">{formatFileSize(pf.file.size)}</span>
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-primary border-primary/30">New</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setPendingFiles((prev) => prev.filter((f) => f.id !== pf.id))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Publish toggle */}
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Publish immediately</p>
                <p className="text-xs text-muted-foreground">Staff will be able to view and agree to this policy</p>
              </div>
              <Switch
                checked={form.is_published}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_published: v }))}
              />
            </div>

            {editingPolicy && (
              <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3">
                <RefreshCw className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Editing the policy content or attachments will bump the version number and require staff to re-agree.</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={closeDialog}>Cancel</Button>
            <Button className="rounded-xl" onClick={handleSubmit} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Saving..." : editingPolicy ? "Update Policy" : "Create Policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agreements Dialog */}
      <Dialog open={!!agreementsTarget} onOpenChange={(o) => !o && setAgreementsTarget(null)}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Agreements — {agreementsTarget?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-80 overflow-y-auto">
            {agreements
              .filter((a) => a.policy_id === agreementsTarget?.id && a.policy_version === agreementsTarget?.version)
              .map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium truncate">{userMap[a.user_id] || a.user_id.slice(0, 8) + "..."}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{format(new Date(a.agreed_at), "MMM d, yyyy HH:mm")}</span>
                </div>
              ))}
            {agreements.filter((a) => a.policy_id === agreementsTarget?.id).length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No agreements recorded yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={!!historyTarget} onOpenChange={(o) => !o && setHistoryTarget(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Version History — {historyTarget?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Current version */}
            {historyTarget && (
              <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="text-xs">v{historyTarget.version}</Badge>
                    <Badge variant="outline" className="text-[10px]">Current</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(historyTarget.updated_at), "MMM d, yyyy HH:mm")}
                  </span>
                </div>
                <div className="prose prose-sm max-w-none text-foreground rounded-lg bg-background/60 p-3 max-h-40 overflow-y-auto">
                  <ReactMarkdown>{historyTarget.body || "*No content.*"}</ReactMarkdown>
                </div>
                {getDocsForPolicy(historyTarget.id).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {getDocsForPolicy(historyTarget.id).map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] hover:bg-muted/50 transition-colors"
                      >
                        {fileIcon(doc.file_type)}
                        <span className="truncate max-w-[120px]">{doc.file_name}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Previous versions */}
            {versionHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No previous versions.</p>
            ) : (
              versionHistory.map((v) => (
                <div key={v.id} className="rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">v{v.version}</Badge>
                      {v.changed_by && (
                        <span className="text-[11px] text-muted-foreground">
                          by {userMap[v.changed_by] || "Unknown"}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(v.created_at), "MMM d, yyyy HH:mm")}
                    </span>
                  </div>
                  {v.title !== historyTarget?.title && (
                    <p className="text-xs text-muted-foreground">Title: {v.title}</p>
                  )}
                  <div className="prose prose-sm max-w-none text-foreground rounded-lg bg-muted/30 p-3 max-h-40 overflow-y-auto">
                    <ReactMarkdown>{v.body || "*No content.*"}</ReactMarkdown>
                  </div>
                  {v.documents && v.documents.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {v.documents.map((doc, idx) => (
                        <a
                          key={idx}
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] hover:bg-muted/50 transition-colors"
                        >
                          {fileIcon(doc.file_type)}
                          <span className="truncate max-w-[120px]">{doc.file_name}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
