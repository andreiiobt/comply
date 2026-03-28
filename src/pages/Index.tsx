import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export default function Index() {
  const { user, loading, primaryRole } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;

    // If user is already authenticated with a role, skip setup check entirely
    if (user && primaryRole) {
      setChecking(false);
      return;
    }

    // Only check setup_completed for unauthenticated users
    if (!user) {
      supabase
        .from("setup_completed")
        .select("completed")
        .eq("id", 1)
        .single()
        .then(({ data }) => {
          if (!data?.completed) {
            navigate("/register", { replace: true });
            return;
          }
          setChecking(false);
        });
    } else {
      setChecking(false);
    }
  }, [navigate, loading, user, primaryRole]);

  useEffect(() => {
    if (checking || loading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    switch (primaryRole) {
      case "admin":
        navigate("/admin/dashboard", { replace: true });
        break;
      case "manager":
        navigate("/manager/dashboard", { replace: true });
        break;
      case "supervisor":
        navigate("/supervisor/dashboard", { replace: true });
        break;
      default:
        navigate("/home", { replace: true });
    }
  }, [user, loading, primaryRole, navigate, checking]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="animate-bounce-in">
        <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center">
          <span className="text-2xl font-display font-bold text-primary-foreground">C</span>
        </div>
      </div>
    </div>
  );
}