import { NavLink } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'

export default function SmsShell({ children }) {
  const { session, logout, setTenantSlug } = useAuth()

  return (
    <div className="module-stage">
      <div className="waba-shell">
        <aside className="waba-sidebar">
          <div className="waba-brand">Textzy SMS</div>
          <p className="sidebar-meta">{session.email || 'Not logged in'}</p>
          <p className="sidebar-meta">Role: {session.role || '-'}</p>
          <select className="sidebar-select" value={session.tenantSlug} onChange={(e) => setTenantSlug(e.target.value)}>
            <option value="demo-retail">demo-retail</option>
            <option value="demo-d2c">demo-d2c</option>
          </select>
          <nav>
            <NavLink to="/modules/sms/customize">Customization</NavLink>
            <NavLink to="/modules/sms/flows">Active Flows</NavLink>
            <NavLink to="/modules/sms/builder">Flow Builder</NavLink>
            <NavLink to="/modules/sms/inputs">Input Fields</NavLink>
            <NavLink to="/modules/sms/frames">Design Frames</NavLink>
            <NavLink to="/modules/waba/dashboard">Go WABA</NavLink>
          </nav>
          <button className="ghost sidebar-logout" onClick={logout}>Logout</button>
        </aside>
        <section className="waba-main">{children}</section>
      </div>
    </div>
  )
}
