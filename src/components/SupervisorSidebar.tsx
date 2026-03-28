import {
  LayoutDashboard, CheckSquare, LogOut, Home, AlertTriangle, CalendarCheck,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingProvider";
import { CompanyLogo } from "@/components/CompanyLogo";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", url: "/supervisor/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Compliance",
    items: [
      { title: "Daily Overview", url: "/supervisor/daily-overview", icon: CalendarCheck },
      { title: "Checklists", url: "/supervisor/checklists", icon: CheckSquare },
      { title: "Incidents", url: "/supervisor/incidents", icon: AlertTriangle },
    ],
  },
];

export function SupervisorSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut, profile } = useAuth();
  const { company } = useBranding();
  const navigate = useNavigate();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="px-3 py-4">
          <CompanyLogo logoUrl={company?.logo_url} companyName={company?.name} size="sm" showName={!collapsed} />
        </div>

        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
              {!collapsed ? group.label : ""}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/supervisor/dashboard"}
                        className="hover:bg-sidebar-accent/50 rounded-lg"
                        activeClassName="bg-primary/10 text-primary font-semibold"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className="p-2 px-0">
          {!collapsed && profile?.full_name && (
            <p className="text-xs text-muted-foreground mb-2 px-2 truncate">{profile.full_name}</p>
          )}
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "default"}
            className={cn("w-full font-bold rounded-xl gap-2", collapsed ? "justify-center" : "justify-start")}
            onClick={() => navigate("/home")}
          >
            <Home className="h-4 w-4" />
            {!collapsed && <span>Back To App</span>}
          </Button>
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "default"}
            className={cn("w-full text-muted-foreground hover:bg-transparent hover:text-foreground", collapsed ? "justify-center" : "justify-start")}
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
