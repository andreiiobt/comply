import { Outlet, useLocation, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ManagerSidebar } from "@/components/ManagerSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TrialBanner } from "@/components/TrialBanner";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  staff: "Staff",
  checklists: "Checklists",
  "checklist-templates": "Templates",
  incidents: "Incident Reports",
  reports: "Reports",
};

const sectionLabels: Record<string, string> = {
  dashboard: "Overview",
  staff: "Team",
  checklists: "Compliance",
  "checklist-templates": "Compliance",
  incidents: "Compliance",
  reports: "Compliance",
};

export default function ManagerLayout() {
  const location = useLocation();
  const { profile } = useAuth();
  const segments = location.pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1] || "dashboard";
  const isDetail = UUID_RE.test(lastSegment);
  const currentPage = isDetail ? (segments[segments.length - 2] || "dashboard") : lastSegment;

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <ManagerSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b px-4 bg-card">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to="/manager/dashboard" className="text-muted-foreground hover:text-foreground">
                        {sectionLabels[currentPage] || "Manager"}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-display font-semibold">
                      {routeLabels[currentPage] || currentPage}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <Link to="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <span className="text-sm text-muted-foreground hidden sm:block">{profile?.full_name}</span>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-display font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Link>
          </header>
          <TrialBanner />
          <main className="flex-1 p-4 sm:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
