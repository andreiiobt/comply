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
import { UserPlus, Lock, User, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function AcceptInvite() {
  const { code } = useParams<{ code: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<any>(null);
  const [companyName, setCompanyName] = useState("");
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New-user setup form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Whether the logged-in user still needs to complete account setup
  // (true when they arrived via magic link with no name set yet)
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    if (!code) return;
    (async () => {
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
      setLoadingInvite(false);
    })();
  }, [code]);

  // Once we know the user and invite, decide if they need setup
  useEffect(() => {
    if (!user || authLoading) return;
    const name = user.user_metadata?.full_name || "";
    setNeedsSetup(!name.trim());
  }, [user, authLoading]);

  const callAcceptInvite = async () => {
    const res = await supabase.functions.invoke("accept-invite", {
      body: { inviteCode: code },
    });
    if (res.error || res.data?.error) {
      throw new Error(res.data?.error || res.error?.message || "Failed to accept invite");
    }
  };

  // For existing users who already have a name — just accept
  const handleAccept = async () => {
    setIsSubmitting(true);
    try {
      await callAcceptInvite();
      toast.success("You've joined the team!");
      window.location.href = "/";
    } catch (err: any) {
      toast.error(err.message);
      setIsSubmitting(false);
    }
  };

  // For new users arriving via magic link — set name + password then accept
  const handleSetupAndJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!firstName.trim()) { toast.error("Please enter your first name"); return; }
    if (!lastName.trim()) { toast.error("Please enter your last name"); return; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { toast.error("Passwords don't match"); return; }

    setIsSubmitting(true);
    try {
      // Set name and password in one call
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { full_name: fullName },
      });
      if (updateError) throw updateError;

      await callAcceptInvite();
      toast.success("Welcome to the team!");
      window.location.href = "/";
    } catch (err: any) {
      toast.error(err.message);
      setIsSubmitting(false);
    }
  };

  // Auto-accept for existing users (already have setup) arriving at this page
  useEffect(() => {
    if (!user || !invite || loadingInvite || authLoading || needsSetup) return;

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
  }, [user, invite, loadingInvite, authLoading, needsSetup]);

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
        <Card className="rounded-2xl max-w-md w-full">
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

  // Logged-in, needs to set name + password (new user via magic link)
  if (user && needsSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <UserPlus className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-extrabold text-foreground mt-4">
              Welcome to {companyName}
            </h1>
            <p className="text-muted-foreground mt-1">
              You've been invited as{" "}
              <span className="font-medium text-foreground capitalize">{invite?.role}</span>
            </p>
          </div>

          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-display">Complete your account</CardTitle>
              <CardDescription>Set your name and password to get started</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSetupAndJoin} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="flex items-center gap-2 text-sm font-medium">
                      <User className="h-4 w-4 text-muted-foreground" />
                      First Name
                    </Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jane"
                      required
                      autoFocus
                      className="h-12 rounded-xl text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-sm font-medium">
                      Last Name
                    </Label>
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
                  <Label htmlFor="password" className="flex items-center gap-2 text-sm font-medium">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      required
                      minLength={6}
                      className="h-12 rounded-xl text-base pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="flex items-center gap-2 text-sm font-medium">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    Confirm Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    required
                    minLength={6}
                    className="h-12 rounded-xl text-base"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-12 rounded-xl text-base font-bold mt-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Set Up & Join"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Logged-in existing user — auto-accept is running, show spinner
  if (user && !needsSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="rounded-2xl">
            <CardContent className="flex flex-col items-center py-12 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">Joining {companyName}...</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Not logged in — shouldn't normally reach here with the new magic link flow,
  // but keep as a fallback for manually shared links or expired magic links.
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
            <span className="font-medium text-foreground capitalize">{invite?.role}</span>
          </p>
        </div>

        <Card className="rounded-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-lg font-display">This link has expired</CardTitle>
            <CardDescription>
              The invitation link may have expired. Ask your administrator to resend the invite.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full rounded-xl"
              onClick={() => navigate("/login")}
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
