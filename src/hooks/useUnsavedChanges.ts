import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

export function useUnsavedChanges(hasChanges: boolean) {
  const [showDialog, setShowDialog] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const navigate = useNavigate();

  const confirmLeave = useCallback(() => {
    setShowDialog(false);
    if (pendingPath) {
      const path = pendingPath;
      setPendingPath(null);
      navigate(path);
    }
  }, [pendingPath, navigate]);

  const cancelLeave = useCallback(() => {
    setShowDialog(false);
    setPendingPath(null);
  }, []);

  const safeNavigate = useCallback(
    (path: string) => {
      if (hasChanges) {
        setPendingPath(path);
        setShowDialog(true);
      } else {
        navigate(path);
      }
    },
    [hasChanges, navigate]
  );

  // Handle browser back/refresh
  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  // Handle popstate (browser back button)
  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: PopStateEvent) => {
      // Push state back to prevent navigation
      window.history.pushState(null, "", window.location.href);
      setPendingPath("/home");
      setShowDialog(true);
    };
    // Push an extra history entry so we can intercept back
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [hasChanges]);

  return { showDialog, confirmLeave, cancelLeave, safeNavigate };
}
