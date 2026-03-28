import {
  LayoutDashboard, MapPin, Users, Palette, LogOut, BarChart3, CheckSquare, Tag, Plug, Home, ClipboardList, AlertTriangle, CalendarCheck, CreditCard,
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
    items: [{ title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "People",
    items: [
      { title: "Users", url: "/admin/users", icon: Users },
      { title: "Custom Roles", url: "/admin/custom-roles", icon: Tag },
      { title: "Locations", url: "/admin/locations", icon: MapPin },
    ],
  },
  {
    label: "Compliance",
    items: [
      { title: "Daily Overview", url: "/admin/daily-overview", icon: CalendarCheck },
      { title: "Templates", url: "/admin/checklist-templates", icon: CheckSquare },
      { title: "Submissions", url: "/admin/checklists", icon: ClipboardList },
      { title: "Incidents", url: "/admin/incidents", icon: AlertTriangle },
      { title: "Reports", url: "/admin/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Settings",
    items: [
      { title: "Billing", url: "/admin/billing", icon: CreditCard },
      { title: "Branding", url: "/admin/branding", icon: Palette },
      { title: "Integrations", url: "/admin/integrations", icon: Plug },
    ],
  },
];

export function AdminSidebar() {
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
                        end={item.url === "/admin/dashboard"}
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
