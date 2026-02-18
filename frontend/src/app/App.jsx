import { Navigate, Route, Routes } from 'react-router-dom'
import LandingPage from '../pages/LandingPage'
import LoginPage from '../pages/auth/LoginPage'
import UnauthorizedPage from '../pages/auth/UnauthorizedPage'
import ProtectedRoute from '../components/auth/ProtectedRoute'
import WabaDashboardPage from '../pages/modules/waba/WabaDashboardPage'
import WabaTemplatesPage from '../pages/modules/waba/WabaTemplatesPage'
import WabaCampaignsPage from '../pages/modules/waba/WabaCampaignsPage'
import WabaContactsPage from '../pages/modules/waba/WabaContactsPage'
import WabaLiveChatPage from '../pages/modules/waba/WabaLiveChatPage'
import WabaChatbotPage from '../pages/modules/waba/WabaChatbotPage'
import WabaFramesPage from '../pages/modules/waba/WabaFramesPage'
import SmsCustomizePage from '../pages/modules/sms/SmsCustomizePage'
import SmsFlowsPage from '../pages/modules/sms/SmsFlowsPage'
import SmsBuilderPage from '../pages/modules/sms/SmsBuilderPage'
import SmsInputsPage from '../pages/modules/sms/SmsInputsPage'
import SmsFramesPage from '../pages/modules/sms/SmsFramesPage'

const R = {
  all: ['owner', 'admin', 'manager', 'support', 'marketing', 'finance', 'super_admin'],
  campaignsWrite: ['owner', 'admin', 'manager', 'marketing', 'super_admin'],
  contactsWrite: ['owner', 'admin', 'manager', 'super_admin'],
  automationWrite: ['owner', 'admin', 'manager', 'super_admin']
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      <Route path="/modules/waba/dashboard" element={<ProtectedRoute allowRoles={R.all}><WabaDashboardPage /></ProtectedRoute>} />
      <Route path="/modules/waba/templates" element={<ProtectedRoute allowRoles={R.all}><WabaTemplatesPage /></ProtectedRoute>} />
      <Route path="/modules/waba/campaigns" element={<ProtectedRoute allowRoles={R.campaignsWrite}><WabaCampaignsPage /></ProtectedRoute>} />
      <Route path="/modules/waba/contacts" element={<ProtectedRoute allowRoles={R.contactsWrite}><WabaContactsPage /></ProtectedRoute>} />
      <Route path="/modules/waba/live-chat" element={<ProtectedRoute allowRoles={R.all}><WabaLiveChatPage /></ProtectedRoute>} />
      <Route path="/modules/waba/chatbot" element={<ProtectedRoute allowRoles={R.automationWrite}><WabaChatbotPage /></ProtectedRoute>} />
      <Route path="/modules/waba/frames" element={<ProtectedRoute allowRoles={R.all}><WabaFramesPage /></ProtectedRoute>} />
      <Route path="/modules/waba" element={<Navigate to="/modules/waba/dashboard" replace />} />

      <Route path="/modules/sms/customize" element={<ProtectedRoute allowRoles={R.campaignsWrite}><SmsCustomizePage /></ProtectedRoute>} />
      <Route path="/modules/sms/flows" element={<ProtectedRoute allowRoles={R.all}><SmsFlowsPage /></ProtectedRoute>} />
      <Route path="/modules/sms/builder" element={<ProtectedRoute allowRoles={R.automationWrite}><SmsBuilderPage /></ProtectedRoute>} />
      <Route path="/modules/sms/inputs" element={<ProtectedRoute allowRoles={R.automationWrite}><SmsInputsPage /></ProtectedRoute>} />
      <Route path="/modules/sms/frames" element={<ProtectedRoute allowRoles={R.all}><SmsFramesPage /></ProtectedRoute>} />
      <Route path="/modules/sms" element={<Navigate to="/modules/sms/customize" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
