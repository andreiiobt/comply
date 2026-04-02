import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Building2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export default function Register() {
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const navigate = useNavigate();

  const handleCompanyNameChange = (value: string) => {
    setCompanyName(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

    try {
      const { data, error } = await supabase.functions.invoke("register-company", {
        body: { companyName, slug, fullName, email, password },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // If we got a checkout URL, sign in first then redirect to Polar
      if (data?.checkoutUrl) {
        await supabase.auth.signInWithPassword({ email, password });
        // Ensure name is set on the auth user in case the DB trigger ran before the edge function
        await supabase.auth.updateUser({ data: { full_name: fullName } });
        toast.success("Company created! Redirecting to set up billing...");
        window.location.href = data.checkoutUrl;
        return;
      }

      // Fallback: sign in and redirect to dashboard
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!signInError) {
        // Ensure the profile name is correct — fixes cases where the DB trigger
        // creates the profile row before the edge function can write the name
        await supabase.auth.updateUser({ data: { full_name: fullName } });
        await supabase
          .from("profiles")
          .update({ full_name: fullName })
          .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "");
      }

      if (signInError) {
        toast.success("Company registered! Please log in.");
        navigate("/login");
      } else {
        toast.success("Welcome! Your company is ready.");
        navigate("/admin/dashboard");
      }
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center">
              <Building2 className="h-8 w-8 text-primary-foreground" />
            </div>
          </motion.div>
          <h1 className="text-3xl font-display font-extrabold text-foreground mt-4">
            Create Your Company
          </h1>
          <p className="text-muted-foreground mt-1">Set up your compliance workspace</p>
          <img src="/images/iobt-logo.svg" alt="IOBT" className="h-5 mt-2 opacity-60" />
        </div>

        <Card className="  rounded-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-display">Register</CardTitle>
            <CardDescription>Create a new company account with a 30-day free trial</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => handleCompanyNameChange(e.target.value)}
                  placeholder="Acme Corp"
                  required
                  className="h-12 rounded-xl text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Subdomain</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => {
                      setSlug(slugify(e.target.value));
                      setSlugEdited(true);
                    }}
                    placeholder="acme"
                    required
                    minLength={2}
                    maxLength={50}
                    className="h-12 rounded-xl text-base"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">.comply.app</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                    required
                    className="h-12 rounded-xl text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Smith"
                    required
                    className="h-12 rounded-xl text-base"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@acme.com"
                  required
                  className="h-12 rounded-xl text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="h-12 rounded-xl text-base"
                />
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 rounded-xl text-base font-bold   transition-all"
              >
                {isLoading ? (
                  <div className="h-5 w-5  border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <>
                    <Building2 className="h-5 w-5 mr-2" />
                    Create Company
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/login")}
                className="w-full"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
