import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";
import { CompanyLogo } from "@/components/CompanyLogo";
import { useTenant } from "@/contexts/TenantContext";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { tenant } = useTenant();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast.error(error.message);
    } else {
      setSent(true);
      toast.success("Check your email for a password reset link");
    }
    setIsLoading(false);
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
          <CompanyLogo
            logoUrl={tenant?.logo_url || "/images/iobt-icon.svg"}
            companyName={tenant?.name}
            size="lg"
            showName={false}
          />
          <h1 className="text-3xl font-display font-extrabold text-foreground mt-4">
            {tenant?.name || "Comply"}
          </h1>
        </div>

        <Card className="  rounded-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-display">Reset Password</CardTitle>
            <CardDescription>
              {sent
                ? "We've sent a reset link to your email"
                : "Enter your email to receive a password reset link"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Check your inbox for <strong>{email}</strong> and follow the link to reset your password.
                </p>
                <Link to="/login">
                  <Button variant="outline" className="w-full h-12 rounded-xl">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Login
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
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
                    "Send Reset Link"
                  )}
                </Button>
                <div className="text-center">
                  <Link to="/login" className="text-sm text-muted-foreground hover:text-primary">
                    <ArrowLeft className="h-3 w-3 inline mr-1" />
                    Back to Login
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
