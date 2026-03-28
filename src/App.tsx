import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingProvider";
import { TenantProvider } from "@/contexts/TenantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Setup = lazy(() => import("./pages/Setup"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ClaimAccount = lazy(() => import("./pages/ClaimAccount"));
const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const Locations = lazy(() => import("./pages/admin/Locations"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const Reports = lazy(() => import("./pages/admin/Reports"));
const Branding = lazy(() => import("./pages/admin/Branding"));
const Billing = lazy(() => import("./pages/admin/Billing"));
const ChecklistReview = lazy(() => import("./pages/admin/ChecklistReview"));
const ChecklistTemplates = lazy(() => import("./pages/admin/ChecklistTemplates"));
const CustomRoles = lazy(() => import("./pages/admin/CustomRoles"));
const Integrations = lazy(() => import("./pages/admin/Integrations"));
const ManagerLayout = lazy(() => import("./layouts/ManagerLayout"));
const ManagerDashboard = lazy(() => import("./pages/manager/Dashboard"));
const ManagerStaff = lazy(() => import("./pages/manager/Staff"));
const ManagerChecklists = lazy(() => import("./pages/manager/Checklists"));
const ManagerChecklistTemplates = lazy(() => import("./pages/manager/ChecklistTemplates"));
const AdminDailyOverview = lazy(() => import("./pages/admin/DailyOverview"));
const ManagerDailyOverview = lazy(() => import("./pages/manager/DailyOverview"));
const AdminIncidentReports = lazy(() => import("./pages/admin/IncidentReports"));
const AdminIncidentReportDetail = lazy(() => import("./pages/admin/IncidentReportDetail"));
const AdminChecklistSubmissionDetail = lazy(() => import("./pages/admin/ChecklistSubmissionDetail"));
const ManagerIncidentReports = lazy(() => import("./pages/manager/IncidentReports"));
const ManagerIncidentReportDetail = lazy(() => import("./pages/manager/IncidentReportDetail"));
const ManagerChecklistSubmissionDetail = lazy(() => import("./pages/manager/ChecklistSubmissionDetail"));
const AdminUserIncidentProfile = lazy(() => import("./pages/admin/UserIncidentProfile"));
const ManagerUserIncidentProfile = lazy(() => import("./pages/manager/UserIncidentProfile"));
const SupervisorLayout = lazy(() => import("./layouts/SupervisorLayout"));
const SupervisorDashboard = lazy(() => import("./pages/supervisor/Dashboard"));
const SupervisorChecklists = lazy(() => import("./pages/supervisor/Checklists"));
const SupervisorChecklistSubmissionDetail = lazy(() => import("./pages/supervisor/ChecklistSubmissionDetail"));
const SupervisorIncidentReports = lazy(() => import("./pages/supervisor/IncidentReports"));
const SupervisorIncidentReportDetail = lazy(() => import("./pages/supervisor/IncidentReportDetail"));
const SupervisorDailyOverview = lazy(() => import("./pages/supervisor/DailyOverview"));
const SupervisorUserIncidentProfile = lazy(() => import("./pages/supervisor/UserIncidentProfile"));
const AuditorHome = lazy(() => import("./pages/AuditorHome"));
const Profile = lazy(() => import("./pages/Profile"));
const FillChecklist = lazy(() => import("./pages/staff/FillChecklist"));
const ReportIncident = lazy(() => import("./pages/staff/ReportIncident"));
const SubmissionDetail = lazy(() => import("./pages/staff/SubmissionDetail"));
const MyChecklists = lazy(() => import("./pages/staff/MyChecklists"));
const MySubmissions = lazy(() => import("./pages/staff/MySubmissions"));

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
              <Suspense fallback={
                <div className="flex h-screen w-full items-center justify-center bg-background">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              }>
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
              </Suspense>
            </BrandingProvider>
          </AuthProvider>
        </TenantProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
