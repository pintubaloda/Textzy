import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { getSession } from "@/lib/api";

// Landing Page
import LandingPage from "@/pages/LandingPage";

// Auth Pages
import LoginPage from "@/pages/auth/LoginPage";
import ProjectSelectPage from "@/pages/auth/ProjectSelectPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";

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
import SmsSetupPage from "@/pages/dashboard/SmsSetupPage";

function App() {
  const authed = !!getSession().token;
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

          {/* Dashboard Routes */}
          <Route path="/dashboard" element={authed ? <DashboardLayout /> : <Navigate to="/login" replace />}>
            <Route index element={<DashboardOverview />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="sms-setup" element={<SmsSetupPage />} />
            <Route path="automations" element={<AutomationsPage />} />
            <Route path="automations/workflow" element={<AutomationsPage />} />
            <Route path="automations/qa" element={<AutomationsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="whatsapp-onboarding" element={<Navigate to="/dashboard/settings?tab=whatsapp" replace />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="platform-settings" element={<PlatformSettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
