import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, CheckSquare, CheckCircle2, Clock, XCircle,
  FileText, Award, AlertTriangle, Calendar, ExternalLink,
  ShieldCheck, History, User as UserIcon, Tag
} from "lucide-react";
import { format, isPast, isWithinInterval, addDays } from "date-fns";
import { useNavigate } from "react-router-dom";

interface UserDetailViewProps {
  user: { user_id: string; full_name: string | null };
  onBack: () => void;
}

export default function UserDetailView({ user, onBack }: UserDetailViewProps) {
  const navigate = useNavigate();

  // 1. Basic Profile & Company context
  const { data: userProfile } = useQuery({
    queryKey: ["admin-user-profile", user.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.user_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // 2. Submissions
  const { data: submissions = [] } = useQuery({
    queryKey: ["admin-user-submissions", user.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("checklist_submissions")
        .select("*")
        .eq("user_id", user.user_id)
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  const templateIds = [...new Set(submissions.map((s) => s.template_id).filter(Boolean))];
  const { data: templateMap = {} } = useQuery({
    queryKey: ["admin-user-template-titles", templateIds],
    queryFn: async () => {
      if (!templateIds.length) return {};
      const { data } = await supabase.from("checklist_templates").select("id, title").in("id", templateIds);
      const map: Record<string, string> = {};
      (data || []).forEach((t) => { map[t.id] = t.title; });
      return map;
    },
    enabled: templateIds.length > 0,
  });

  // 3. Licenses
  const { data: licenses = [] } = useQuery({
    queryKey: ["admin-user-licenses", user.user_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_licenses")
        .select("*")
        .eq("user_id", user.user_id)
        .order("expires_at", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // 4. Incident Reports
  const { data: incidents = [] } = useQuery({
    queryKey: ["admin-user-incidents", user.user_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("incident_reports")
        .select("*")
        .or(`user_id.eq.${user.user_id},involved_user_ids.cs.["${user.user_id}"]`)
        .order("incident_date", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // 5. Policies & Agreements
  const { data: policiesWithAgreements = [] } = useQuery({
    queryKey: ["admin-user-policies", user.user_id, userProfile?.company_id],
    queryFn: async () => {
      if (!userProfile?.company_id) return [];
      const { data: policies } = await (supabase as any)
        .from("policies")
        .select("*")
        .eq("company_id", userProfile.company_id)
        .eq("is_published", true);
      const { data: agreements } = await (supabase as any)
        .from("policy_agreements")
        .select("*")
        .eq("user_id", user.user_id);
      
      const agreements_list = (agreements || []) as any[];
      return ((policies || []) as any[]).map(p => ({
        ...p,
        agreement: agreements_list?.find(a => a.policy_id === p.id)
      }));
    },
    enabled: !!userProfile?.company_id,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved": 
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200/50 rounded-full  px-2.5 py-0.5 text-xs font-bold gap-1 mt-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approved
          </Badge>
        );
      case "pending": 
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200/50 rounded-full  px-2.5 py-0.5 text-xs font-bold gap-1 mt-1">
            <Clock className="h-3.5 w-3.5" />
            Pending
          </Badge>
        );
      case "rejected": 
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200/50 rounded-full  px-2.5 py-0.5 text-xs font-bold gap-1 mt-1">
            <XCircle className="h-3.5 w-3.5" />
            Rejected
          </Badge>
        );
      default: return <Badge variant="outline" className="capitalize rounded-full">{status}</Badge>;
    }
  };

  const getLicenseStatus = (expiryDate: string | null) => {
    if (!expiryDate) return { label: "Active", color: "text-primary bg-primary/10" };
    const date = new Date(expiryDate);
    if (isPast(date)) return { label: "Expired", color: "text-destructive bg-destructive/10" };
    const soon = isWithinInterval(date, { start: new Date(), end: addDays(new Date(), 30) });
    if (soon) return { label: "Expiring Soon", color: "text-orange-500 bg-orange-500/10" };
    return { label: "Active", color: "text-primary bg-primary/10" };
  };

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          All Users
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <UserIcon className="h-6 w-6 text-primary" />
              {user.full_name || "Unnamed"}
            </h1>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="rounded-xl border-none bg-muted/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold tabular-nums">{submissions.length}</p>
            <p className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <CheckSquare className="h-3.5 w-3.5" /> Checklists
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-none bg-muted/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-primary">{submissions.filter(s => s.status === "approved").length}</p>
            <p className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Approved
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-none bg-muted/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold tabular-nums">
              {licenses.filter(l => !l.expires_at || !isPast(new Date(l.expires_at))).length}
            </p>
            <p className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <Award className="h-3.5 w-3.5" /> Active Licenses
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-none bg-muted/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-orange-500">
              {policiesWithAgreements.filter(p => p.agreement).length}
            </p>
            <p className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <FileText className="h-3.5 w-3.5" /> Policy Sign-off
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="rounded-xl">
          <TabsTrigger value="overview" className="rounded-lg gap-1.5">
            <History className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="compliance" className="rounded-lg gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="licenses" className="rounded-lg gap-1.5">
            <Award className="h-3.5 w-3.5" />
            Licenses
          </TabsTrigger>
          <TabsTrigger value="incidents" className="rounded-lg gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Incidents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card className="rounded-2xl">
            <CardHeader className="pb-3 px-5 pt-5">
              <CardTitle className="text-lg font-display font-bold flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-green-600" /> Recent Submissions
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-1">
              {submissions.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground italic">No submissions yet</div>
              ) : (
                <div className="divide-y divide-border/50">
                  {submissions.slice(0, 5).map((sub) => {
                    const tplTitle = sub.template_id ? (templateMap as any)[sub.template_id] : null;
                    return (
                      <div 
                        key={sub.id} 
                        className="flex items-center justify-between py-4 cursor-pointer hover:bg-muted/5 transition-colors group" 
                        onClick={() => navigate(`/admin/checklist-submissions/${sub.id}`)}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-sm group-hover:text-primary transition-colors">
                            {tplTitle || "General Checklist"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(sub.created_at), "MMM d, h:mm a")}
                          </span>
                        </div>
                        <div className="flex items-center">
                          {getStatusBadge(sub.status)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-3">
          {policiesWithAgreements.length === 0 ? (
            <Card className="rounded-2xl border-dashed py-12 flex flex-col items-center text-muted-foreground bg-muted/20">
              <FileText className="h-10 w-10 opacity-20 mb-3" />
              <p className="text-sm font-display">No policies defined.</p>
            </Card>
          ) : (
            <Card className="rounded-2xl border-none bg-muted/30">
              <CardHeader className="pb-0 px-5 pt-5">
                <CardTitle className="text-lg font-display font-bold flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" /> Policies & Agreements
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-2">
                <div className="divide-y divide-border/30">
                  {policiesWithAgreements.map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-4 group cursor-default">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl transition-colors ${p.agreement ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {p.agreement ? <ShieldCheck className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                        </div>
                        <div className="flex flex-col">
                          <h4 className="font-bold text-sm tracking-tight">{p.title}</h4>
                          <p className="text-xs text-muted-foreground font-medium">Version {p.version}</p>
                        </div>
                      </div>
                      
                      {p.agreement ? (
                        <div className="text-right flex flex-col items-end">
                          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 rounded-full  px-2 py-0 h-5 text-[10px] font-bold uppercase tracking-wider">Agreed</Badge>
                          <p className="text-[11px] text-muted-foreground mt-1 font-medium">
                            {format(new Date(p.agreement.agreed_at), "MMM d, yyyy")}
                          </p>
                        </div>
                      ) : (
                        <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-none rounded-full  px-2.5 h-6 text-xs font-medium">Pending Sign-off</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="licenses" className="space-y-4">
          {licenses.length === 0 ? (
            <Card className="rounded-2xl border-dashed py-12 flex flex-col items-center text-muted-foreground bg-muted/20">
              <Award className="h-10 w-10 opacity-20 mb-3" />
              <p className="text-sm font-display">No uploaded licenses.</p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {licenses.map((lic) => {
                const status = getLicenseStatus(lic.expires_at);
                return (
                  <Card key={lic.id} className="rounded-2xl p-4 relative overflow-hidden group hover:shadow-md transition-all border-none bg-muted/40">
                    <div className="flex flex-col h-full space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="bg-primary/5 p-1.5 rounded-lg">
                          <Award className="h-4 w-4 text-primary" />
                        </div>
                        <Badge className={`${status.color} border-none font-bold text-[9px] px-1.5 h-4 uppercase tracking-wider`}>
                          {status.label}
                        </Badge>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold truncate mb-0.5">{lic.license_name}</h4>
                        {lic.license_number && <p className="text-xs text-muted-foreground mb-3 font-medium">#{lic.license_number}</p>}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>Expires: {lic.expires_at ? format(new Date(lic.expires_at), "MMM d, yyyy") : "No expiry"}</span>
                        </div>
                      </div>
                      {lic.document_url && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full rounded-lg gap-1.5 h-8 text-[10px] bg-background hover:bg-muted"
                          onClick={() => window.open(lic.document_url!, "_blank")}
                        >
                          <ExternalLink className="h-3 w-3" /> View Document
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="incidents" className="space-y-4">
          {incidents.length === 0 ? (
            <Card className="rounded-2xl border-dashed py-12 flex flex-col items-center text-muted-foreground bg-muted/20">
              <AlertTriangle className="h-10 w-10 opacity-20 mb-3" />
              <p className="text-sm font-display">No recorded incidents.</p>
            </Card>
          ) : (
            <Card className="rounded-2xl border-none bg-muted/30">
              <CardHeader className="pb-0 px-5 pt-5">
                <CardTitle className="text-lg font-display font-bold flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" /> Recent Incidents
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-2">
                <div className="divide-y divide-border/30">
                  {incidents.map((inc) => (
                    <div 
                      key={inc.id} 
                      className="flex items-center justify-between py-4 cursor-pointer hover:bg-muted/5 transition-colors group" 
                      onClick={() => navigate(`/admin/incidents/${inc.id}`)}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-xl bg-destructive/5 text-destructive group-hover:bg-destructive/10 transition-colors`}>
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col">
                          <p className="font-bold text-sm group-hover:text-primary transition-colors">{inc.title}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <span>{format(new Date(inc.incident_date), "MMM d, yyyy")}</span>
                            <span>·</span>
                            <span className="font-medium">{inc.user_id === user.user_id ? "Reporter" : "Involved Party"}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <Badge variant="outline" className="text-xs h-6 font-bold capitalize border-none bg-muted px-2.5 rounded-full">{inc.status}</Badge>
                        <Badge variant="destructive" className="bg-destructive/10 text-destructive border-none text-[10px] font-extrabold tracking-wider px-2 h-4 uppercase rounded-full">{inc.severity}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
