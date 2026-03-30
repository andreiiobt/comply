import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { UserPlus, Mail, Lock, User, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AcceptInvite() {
  const { code } = useParams<{ code: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<any>(null);
  const [companyName, setCompanyName] = useState("");
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Signup form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!code) return;
    (async () => {
      // Fetch invite (RLS allows anyone to see pending invites)
      const { data, error: fetchError } = await supabase
        .from("invitations")
        .select("*, companies(name)")
        .eq("invite_code", code)
        .maybeSingle();

      if (fetchError || !data) {
        setError("This invitation is invalid or has expired.");
        setLoadingInvite(false);
        return;
      }

      setInvite(data);
      setCompanyName((data as any).companies?.name || "");
      if (data.email) setEmail(data.email);
      setLoadingInvite(false);
    })();
  }, [code]);

  const acceptInvite = async () => {
    setIsSubmitting(true);
    try {
      const res = await supabase.functions.invoke("accept-invite", {
        body: { inviteCode: code },
      });

      if (res.error || res.data?.error) {
        throw new Error(res.data?.error || res.error?.message || "Failed to accept invite");
      }

      toast.success("You've joined the team!");
      // Force a full reload so auth context picks up new role/company
      window.location.href = "/";
    } catch (err: any) {
      toast.error(err.message);
      setIsSubmitting(false);
    }
  };

  // Auto-accept when a logged-in user lands on the invite page (e.g. after email verification redirect)
  useEffect(() => {
    if (user && invite && !loadingInvite && !authLoading) {
      // If the invite is already accepted, just redirect home — don't re-invoke
      if (invite.status === "accepted") {
        window.location.href = "/";
        return;
      }
      setIsSubmitting(true);
      supabase.functions
        .invoke("accept-invite", { body: { inviteCode: code } })
        .then(({ data, error }) => {
          if (error || data?.error) {
            toast.error(data?.error || error?.message || "Failed to accept invite");
            setIsSubmitting(false);
          } else {
            toast.success("You've joined the team!");
            window.location.href = "/";
          }
        });
    }
  }, [user, invite, loadingInvite, authLoading]);

  const handleSignupAndAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Sign up
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/invite/${code}`,
        },
      });

      if (signUpError) throw signUpError;

      toast.success("Account created! Check your email to verify, then revisit this link to join.");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingInvite || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className=" rounded-2xl max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12">
            <p className="text-destructive font-medium mb-4">{error}</p>
            <Button variant="outline" onClick={() => navigate("/login")}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Logged-in user: show accept button
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="  rounded-2xl">
            <CardHeader className="text-center">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
                <UserPlus className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-xl font-display">Join {companyName}</CardTitle>
              <CardDescription>
                You've been invited as{" "}
                <Badge variant="secondary" className="rounded-lg capitalize">
                  {invite.role}
                </Badge>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={acceptInvite}
                disabled={isSubmitting}
                className="w-full h-12 rounded-xl text-base font-bold"
              >
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="h-5 w-5 mr-2" />
                    Accept & Join
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Not logged in: show signup form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <UserPlus className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-extrabold text-foreground mt-4">
            Join {companyName}
          </h1>
          <p className="text-muted-foreground mt-1">
            You've been invited as{" "}
            <span className="font-medium text-foreground capitalize">{invite.role}</span>
          </p>
        </div>

        <Card className="  rounded-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-display">Create Your Account</CardTitle>
            <CardDescription>Sign up to accept the invitation</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignupAndAccept} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Full Name
                </Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="h-12 rounded-xl text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  readOnly={!!invite.email}
                  className="h-12 rounded-xl text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Password
                </Label>
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
                disabled={isSubmitting}
                className="w-full h-12 rounded-xl text-base font-bold   transition-all"
              >
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button
                onClick={() => navigate("/login")}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Already have an account? Log in first, then revisit this link
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
