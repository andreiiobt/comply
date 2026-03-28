import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageIcon, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { CompanyLogo } from "@/components/CompanyLogo";

export default function Branding() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [companyName, setCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: company } = useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").single();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });

  useEffect(() => {
    if (company) {
      setCompanyName(company.name);
      setLogoUrl(company.logo_url);
    }
  }, [company]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company) return;

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `logos/${company.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("content-images")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error("Failed to upload logo");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(path);
    setLogoUrl(`${urlData.publicUrl}?t=${Date.now()}`);
    setUploading(false);
    toast.success("Logo uploaded! Save to apply.");
  };

  const removeLogo = () => setLogoUrl(null);

  const updateBranding = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No company");
      const { error } = await supabase.from("companies").update({
        name: companyName,
        logo_url: logoUrl,
      }).eq("id", company.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company"] });
      queryClient.invalidateQueries({ queryKey: ["company-public"] });
      toast.success("Settings updated!");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-display font-bold">Logo & Identity</h1>
        <p className="text-muted-foreground">Update your company name and logo</p>
      </div>

      <Card className="rounded-2xl ">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" /> Company Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); updateBranding.mutate(); }} className="space-y-6">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-12 rounded-xl" />
            </div>

            <div className="space-y-2">
              <Label>Company Logo</Label>
              <div className="flex items-center gap-4">
                <CompanyLogo logoUrl={logoUrl} companyName={companyName} size="md" showName={false} />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    {uploading ? "Uploading…" : "Upload"}
                  </Button>
                  {logoUrl && (
                    <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={removeLogo}>
                      <X className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </div>
              <p className="text-xs text-muted-foreground">PNG or SVG recommended. Appears in sidebar, login, and learner home.</p>
            </div>

            <Button type="submit" className="w-full h-12 rounded-xl" disabled={updateBranding.isPending}>
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
