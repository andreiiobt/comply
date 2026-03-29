import { useState } from "react";
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
  ChevronDown, ChevronUp, Shield, Clock
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

const defaultForm = {
  title: "",
  body: "",
  agreement_mode: "manual" as "manual" | "auto",
  is_published: false,
};

export default function AdminPolicies() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [agreementsTarget, setAgreementsTarget] = useState<Policy | null>(null);

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
      if (data.id) {
        // Update & bump version if body changed
        const existing = policies.find((p) => p.id === data.id);
        const bodyChanged = existing && existing.body !== data.body;
        const { error } = await (supabase as any)
          .from("policies")
          .update({
            title: data.title,
            body: data.body,
            agreement_mode: data.agreement_mode,
            is_published: data.is_published,
            ...(bodyChanged ? { version: (existing.version || 1) + 1 } : {}),
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("policies").insert({
          company_id: profile!.company_id,
          title: data.title,
          body: data.body,
          agreement_mode: data.agreement_mode,
          is_published: data.is_published,
          created_by: profile!.user_id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-policies"] });
      toast.success(editingPolicy ? "Policy updated" : "Policy created");
      setDialogOpen(false);
      setEditingPolicy(null);
      setForm(defaultForm);
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

  const openCreate = () => {
    setEditingPolicy(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (p: Policy) => {
    setEditingPolicy(p);
    setForm({ title: p.title, body: p.body, agreement_mode: p.agreement_mode, is_published: p.is_published });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim()) return toast.error("Title is required");
    upsertMutation.mutate({ ...form, ...(editingPolicy ? { id: editingPolicy.id } : {}) });
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
          placeholder="Search policies…"
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
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingPolicy(null); }}>
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
                placeholder="## Overview&#10;&#10;Write your policy content here, or use the Import doc button to upload a PDF, Word, or text file…"
                minHeight="320px"
              />
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
                <span>Editing the policy body will bump the version number and require staff to re-agree.</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="rounded-xl" onClick={handleSubmit} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Saving…" : editingPolicy ? "Update Policy" : "Create Policy"}
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
                    <span className="text-sm font-mono text-muted-foreground truncate">{a.user_id.slice(0, 8)}…</span>
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
    </div>
  );
}
