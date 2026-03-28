import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { LogIn } from "lucide-react";
import { toast } from "sonner";
import { CompanyLogo } from "@/components/CompanyLogo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, user, loading, primaryRole } = useAuth();
  const { tenant, isRootDomain } = useTenant();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // If already logged in, redirect based on role
  useEffect(() => {
    if (loading || !user) return;
    if (primaryRole === "admin") navigate("/admin/dashboard", { replace: true });
    else if (primaryRole === "manager") navigate("/manager/dashboard", { replace: true });
    else if (primaryRole === "supervisor") navigate("/supervisor/dashboard", { replace: true });
    else navigate("/home", { replace: true });
  }, [user, loading, primaryRole, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(email, password);
    if (error) {
      toast.error(error.message);
    } else {
      navigate("/");
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
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            <CompanyLogo
              logoUrl={tenant?.logo_url || "/images/iobt-icon.svg"}
              companyName={tenant?.name}
              size="lg"
              showName={false}
            />
          </motion.div>
          <h1 className="text-3xl font-display font-extrabold text-foreground mt-4">
            {tenant?.name || "Comply"}
          </h1>
          <p className="text-muted-foreground mt-1">Compliance Platform</p>
          <img src="/images/iobt-logo.svg" alt="IOBT" className="h-5 mt-2 opacity-60" />
        </div>

        <Card className="  rounded-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-display">Welcome Back</CardTitle>
            <CardDescription>Sign in to continue</CardDescription>
          </CardHeader>
          <CardContent>
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
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
                    <LogIn className="h-5 w-5 mr-2" />
                    Log In
                  </>
                )}
              </Button>
            </form>
            {isRootDomain && (
              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Don't have a company?{" "}
                  <Link to="/register" className="text-primary font-medium hover:underline">
                    Register here
                  </Link>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
