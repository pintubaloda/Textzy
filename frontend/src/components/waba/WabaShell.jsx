import { NavLink } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'

export default function WabaShell({ children }) {
  const { session, logout, setTenantSlug } = useAuth()

  return (
    <div className="module-stage">
      <div className="waba-shell">
        <aside className="waba-sidebar">
          <div className="waba-brand">ByeWind</div>
          <p className="sidebar-meta">{session.email || 'Not logged in'}</p>
          <p className="sidebar-meta">Role: {session.role || '-'}</p>
          <select className="sidebar-select" value={session.tenantSlug} onChange={(e) => setTenantSlug(e.target.value)}>
            <option value="demo-retail">demo-retail</option>
            <option value="demo-d2c">demo-d2c</option>
          </select>
          <nav>
            <NavLink to="/modules/waba/dashboard">Dashboards</NavLink>
            <NavLink to="/modules/waba/templates">Templates</NavLink>
            <NavLink to="/modules/waba/campaigns">Campaigns</NavLink>
            <NavLink to="/modules/waba/contacts">Contacts</NavLink>
            <NavLink to="/modules/waba/live-chat">Live Chat</NavLink>
            <NavLink to="/modules/waba/chatbot">Chatbot</NavLink>
            <NavLink to="/modules/waba/frames">Design Frames</NavLink>
            <NavLink to="/modules/sms/customize">Go SMS</NavLink>
          </nav>
          <button className="ghost sidebar-logout" onClick={logout}>Logout</button>
        </aside>
        <section className="waba-main">{children}</section>
      </div>
    </div>
  )
}
