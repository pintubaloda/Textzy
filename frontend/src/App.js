import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { getSession, hasPermission } from "@/lib/api";

// Landing Page
import LandingPage from "@/pages/LandingPage";

// Auth Pages
import LoginPage from "@/pages/auth/LoginPage";
import ProjectSelectPage from "@/pages/auth/ProjectSelectPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import AcceptInvitePage from "@/pages/auth/AcceptInvitePage";

// Dashboard Pages
import DashboardLayout from "@/layouts/DashboardLayout";
import DashboardOverview from "@/pages/dashboard/DashboardOverview";
import InboxPage from "@/pages/dashboard/InboxPage";
import ContactsPage from "@/pages/dashboard/ContactsPage";
import CampaignsPage from "@/pages/dashboard/CampaignsPage";
import TemplatesPage from "@/pages/dashboard/TemplatesPage";
import AutomationsPage from "@/pages/dashboard/AutomationsPage";
import AnalyticsPage from "@/pages/dashboard/AnalyticsPage";
import IntegrationsPage from "@/pages/dashboard/IntegrationsPage";
import BillingPage from "@/pages/dashboard/BillingPage";
import SettingsPage from "@/pages/dashboard/SettingsPage";
import AdminPage from "@/pages/dashboard/AdminPage";
import TeamPage from "@/pages/dashboard/TeamPage";
import PlatformSettingsPage from "@/pages/dashboard/PlatformSettingsPage";
import PlatformBrandingPage from "@/pages/dashboard/PlatformBrandingPage";
import SmsSetupPage from "@/pages/dashboard/SmsSetupPage";
import MobileDevicesPage from "@/pages/dashboard/MobileDevicesPage";
import WhatsAppOnboardingPage from "@/pages/dashboard/WhatsAppOnboardingPage";

function App() {
  const session = getSession();
  const authed = !!session.email;
  const isPlatformOwner = (session.role || "").toLowerCase() === "super_admin";
  const can = (permission) => isPlatformOwner || hasPermission(permission, session);
  const canManageTeam = isPlatformOwner || ["owner", "admin"].includes((session.role || "").toLowerCase());
  const firstTenantPath = can("inbox.read")
    ? "/dashboard/inbox"
    : can("contacts.read")
      ? "/dashboard/contacts"
      : can("campaigns.read")
        ? "/dashboard/campaigns"
        : can("automation.read")
          ? "/dashboard/automations"
          : can("billing.read")
            ? "/dashboard/billing"
            : can("api.read")
              ? "/dashboard/settings"
              : "/login";
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/projects" element={<ProjectSelectPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />

          {/* Dashboard Routes */}
          <Route path="/dashboard" element={authed ? <DashboardLayout /> : <Navigate to="/login" replace />}>
            <Route index element={isPlatformOwner ? <DashboardOverview /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="inbox" element={can("inbox.read") ? <InboxPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="contacts" element={can("contacts.read") ? <ContactsPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="campaigns" element={can("campaigns.read") ? <CampaignsPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="templates" element={can("templates.read") ? <TemplatesPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="sms-setup" element={can("templates.read") ? <SmsSetupPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="automations" element={can("automation.read") ? <AutomationsPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="automations/workflow" element={can("automation.read") ? <AutomationsPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="automations/qa" element={can("automation.read") ? <AutomationsPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="analytics" element={can("api.read") ? <AnalyticsPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="integrations" element={can("api.read") ? <IntegrationsPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="whatsapp-onboarding" element={can("inbox.read") ? <WhatsAppOnboardingPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="billing" element={can("billing.read") ? <BillingPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="settings" element={can("api.read") ? <SettingsPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="mobile-devices" element={can("inbox.read") ? <MobileDevicesPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="team" element={canManageTeam ? <TeamPage /> : <Navigate to={firstTenantPath} replace />} />
            <Route path="admin" element={isPlatformOwner ? <AdminPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="platform-settings" element={isPlatformOwner ? <PlatformSettingsPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="platform-branding" element={isPlatformOwner ? <PlatformBrandingPage /> : <Navigate to="/dashboard" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
