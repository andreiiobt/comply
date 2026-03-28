import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingProvider";
import { TenantProvider } from "@/contexts/TenantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";
import NotFound from "./pages/NotFound";
import ClaimAccount from "./pages/ClaimAccount";
import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import Locations from "./pages/admin/Locations";
import AdminUsers from "./pages/admin/Users";
import Reports from "./pages/admin/Reports";
import Branding from "./pages/admin/Branding";
import Billing from "./pages/admin/Billing";
import ChecklistReview from "./pages/admin/ChecklistReview";
import ChecklistTemplates from "./pages/admin/ChecklistTemplates";
import CustomRoles from "./pages/admin/CustomRoles";
import Integrations from "./pages/admin/Integrations";
import ManagerLayout from "./layouts/ManagerLayout";
import ManagerDashboard from "./pages/manager/Dashboard";
import ManagerStaff from "./pages/manager/Staff";
import ManagerChecklists from "./pages/manager/Checklists";
import ManagerChecklistTemplates from "./pages/manager/ChecklistTemplates";
import AdminDailyOverview from "./pages/admin/DailyOverview";
import ManagerDailyOverview from "./pages/manager/DailyOverview";
import AdminIncidentReports from "./pages/admin/IncidentReports";
import AdminIncidentReportDetail from "./pages/admin/IncidentReportDetail";
import AdminChecklistSubmissionDetail from "./pages/admin/ChecklistSubmissionDetail";
import ManagerIncidentReports from "./pages/manager/IncidentReports";
import ManagerIncidentReportDetail from "./pages/manager/IncidentReportDetail";
import ManagerChecklistSubmissionDetail from "./pages/manager/ChecklistSubmissionDetail";
import AdminUserIncidentProfile from "./pages/admin/UserIncidentProfile";
import ManagerUserIncidentProfile from "./pages/manager/UserIncidentProfile";
import SupervisorLayout from "./layouts/SupervisorLayout";
import SupervisorDashboard from "./pages/supervisor/Dashboard";
import SupervisorChecklists from "./pages/supervisor/Checklists";
import SupervisorChecklistSubmissionDetail from "./pages/supervisor/ChecklistSubmissionDetail";
import SupervisorIncidentReports from "./pages/supervisor/IncidentReports";
import SupervisorIncidentReportDetail from "./pages/supervisor/IncidentReportDetail";
import SupervisorDailyOverview from "./pages/supervisor/DailyOverview";
import SupervisorUserIncidentProfile from "./pages/supervisor/UserIncidentProfile";
import AuditorHome from "./pages/AuditorHome";
import Profile from "./pages/Profile";
import FillChecklist from "./pages/staff/FillChecklist";
import ReportIncident from "./pages/staff/ReportIncident";
import SubmissionDetail from "./pages/staff/SubmissionDetail";
import MyChecklists from "./pages/staff/MyChecklists";
import MySubmissions from "./pages/staff/MySubmissions";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <TenantProvider>
          <AuthProvider>
            <BrandingProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/setup" element={<Setup />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/invite/:code" element={<AcceptInvite />} />
                <Route path="/claim" element={<ClaimAccount />} />
                
                {/* Admin routes */}
                <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminLayout /></ProtectedRoute>}>
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="locations" element={<Locations />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="custom-roles" element={<CustomRoles />} />
                  <Route path="checklists" element={<ChecklistReview />} />
                  <Route path="checklist-templates" element={<ChecklistTemplates />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="branding" element={<Branding />} />
                  <Route path="billing" element={<Billing />} />
                  <Route path="integrations" element={<Integrations />} />
                  <Route path="incidents" element={<AdminIncidentReports />} />
                  <Route path="incidents/:id" element={<AdminIncidentReportDetail />} />
                  <Route path="report-incident" element={<ReportIncident />} />
                  <Route path="checklists/:id" element={<AdminChecklistSubmissionDetail />} />
                  <Route path="users/:userId" element={<AdminUserIncidentProfile />} />
                  <Route path="daily-overview" element={<AdminDailyOverview />} />
                </Route>

                {/* Manager routes */}
                <Route path="/manager" element={<ProtectedRoute requiredRole="manager"><ManagerLayout /></ProtectedRoute>}>
                  <Route path="dashboard" element={<ManagerDashboard />} />
                  <Route path="staff" element={<ManagerStaff />} />
                  <Route path="checklists" element={<ManagerChecklists />} />
                  <Route path="checklist-templates" element={<ManagerChecklistTemplates />} />
                  <Route path="incidents" element={<ManagerIncidentReports />} />
                  <Route path="incidents/:id" element={<ManagerIncidentReportDetail />} />
                  <Route path="report-incident" element={<ReportIncident />} />
                  <Route path="checklists/:id" element={<ManagerChecklistSubmissionDetail />} />
                  <Route path="staff/:userId" element={<ManagerUserIncidentProfile />} />
                  <Route path="daily-overview" element={<ManagerDailyOverview />} />
                </Route>

                {/* Supervisor routes */}
                <Route path="/supervisor" element={<ProtectedRoute requiredRole="supervisor"><SupervisorLayout /></ProtectedRoute>}>
                  <Route path="dashboard" element={<SupervisorDashboard />} />
                  <Route path="checklists" element={<SupervisorChecklists />} />
                  <Route path="checklists/:id" element={<SupervisorChecklistSubmissionDetail />} />
                  <Route path="incidents" element={<SupervisorIncidentReports />} />
                  <Route path="incidents/:id" element={<SupervisorIncidentReportDetail />} />
                  <Route path="report-incident" element={<ReportIncident />} />
                  <Route path="daily-overview" element={<SupervisorDailyOverview />} />
                  <Route path="staff/:userId" element={<SupervisorUserIncidentProfile />} />
                </Route>

                {/* Staff / Auditor routes */}
                <Route path="/home" element={<ProtectedRoute><AuditorHome /></ProtectedRoute>} />
                <Route path="/checklist/:templateId" element={<ProtectedRoute><FillChecklist /></ProtectedRoute>} />
                <Route path="/report-incident" element={<ProtectedRoute requiredRole="supervisor"><ReportIncident /></ProtectedRoute>} />
                <Route path="/submission/:id" element={<ProtectedRoute><SubmissionDetail /></ProtectedRoute>} />
                <Route path="/my-checklists" element={<ProtectedRoute><MyChecklists /></ProtectedRoute>} />
                <Route path="/my-submissions" element={<ProtectedRoute><MySubmissions /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrandingProvider>
          </AuthProvider>
        </TenantProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
