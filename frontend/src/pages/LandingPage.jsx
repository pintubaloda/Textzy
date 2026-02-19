import { Link } from 'react-router-dom'

const metrics = [
  { label: 'Messages / day', value: '1.9M+' },
  { label: 'Delivery success', value: '99.2%' },
  { label: 'Active tenants', value: '126+' },
  { label: 'Avg response SLA', value: '< 2 min' }
]

const pillars = [
  {
    title: 'WhatsApp Onboarding + API',
    text: 'Embedded Signup, real WABA/phone discovery, secure webhook validation, and 24h session + template controls.'
  },
  {
    title: 'Realtime Inbox Operations',
    text: 'Unified conversation workspace with assignment, internal notes, typing indicators, and SLA tracking.'
  },
  {
    title: 'Campaign & Broadcast Engine',
    text: 'Queue-driven sends with throttling, retries, compliance checks, and role-aware operational controls.'
  },
  {
    title: 'Tenant Security + RBAC',
    text: 'Opaque session tokens, tenant context resolution, strict permission catalog, and module-level access gates.'
  }
]

export default function LandingPage() {
  return (
    <main className="modern-wrap">
      <header className="modern-header glass">
        <div className="modern-logo">TEXTZY</div>
        <nav>
          <a href="#platform">Platform</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#contact">Contact</a>
        </nav>
        <div className="modern-header-actions">
          <Link className="ghost" to="/login">Sign in</Link>
          <Link className="primary" to="/login">Start Free</Link>
        </div>
      </header>

      <section className="modern-hero" id="platform">
        <div className="modern-left">
          <p className="tag">Omnichannel Customer Communication</p>
          <h1>Modern messaging infrastructure for WhatsApp + SMS businesses.</h1>
          <p className="subtitle">
            Launch secure multi-tenant communication products with embedded onboarding, campaign automation,
            real-time inbox operations, and production-grade API control.
          </p>
          <div className="modern-cta">
            <Link className="primary" to="/login">Launch Workspace</Link>
            <Link className="ghost" to="/modules/waba/frames">View Product Screens</Link>
          </div>
        </div>
        <div className="modern-right glass">
          <h3>Live Operations</h3>
          {metrics.map((m) => (
            <div className="metric" key={m.label}>
              <span>{m.label}</span>
              <b>{m.value}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="modern-grid" id="features">
        {pillars.map((p) => (
          <article className="glass card" key={p.title}>
            <h3>{p.title}</h3>
            <p>{p.text}</p>
          </article>
        ))}
      </section>

      <section className="modern-stack" id="pricing">
        <article className="glass strip">
          <div>
            <h2>Built for module-wise scale</h2>
            <p>Start with WABA onboarding + inbox, then add SMS, automation, templates, and campaign orchestration.</p>
          </div>
          <Link className="primary" to="/login">Explore Platform</Link>
        </article>

        <article className="glass strip" id="contact">
          <div>
            <h2>Deploy on your infrastructure stack</h2>
            <p>Works with your external PostgreSQL, Render deployment, Meta embedded signup, and RBAC policies.</p>
          </div>
          <Link className="ghost" to="/login">Book Demo</Link>
        </article>
      </section>

      <footer className="modern-footer">
        <span>© {new Date().getFullYear()} Textzy</span>
        <div>
          <a href="#platform">Platform</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
        </div>
      </footer>
    </main>
  )
}
