import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Setup() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/register", { replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8  border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}
