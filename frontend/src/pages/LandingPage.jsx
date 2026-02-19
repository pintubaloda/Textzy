import { Link } from 'react-router-dom'

const features = [
  { title: 'WhatsApp Business API', text: 'Embedded Signup onboarding, real WABA discovery, template + session messaging, and webhook handling.' },
  { title: 'SMS Engagement Engine', text: 'Transactional and campaign SMS flows with queueing, throttling, retries, and delivery controls.' },
  { title: 'Unified Agent Inbox', text: 'Real-time inbox with assignment, notes, SLA visibility, and typing indicators for faster support.' },
  { title: 'Multi-Tenant Security', text: 'Tenant-aware auth, opaque session token flow, role-based permissions, and strict isolation controls.' }
]

const plans = [
  { name: 'Starter', price: '₹2,999', points: ['1 WABA', '2 Agents', '5,000 msgs/mo'] },
  { name: 'Growth', price: '₹9,999', points: ['5 WABA/SMS channels', '10 Agents', '50,000 msgs/mo'] },
  { name: 'Scale', price: 'Custom', points: ['Unlimited modules', 'Dedicated infra options', 'Priority onboarding'] }
]

export default function LandingPage() {
  return (
    <main className="lp-wrap">
      <header className="lp-header">
        <div className="lp-logo">Textzy</div>
        <nav className="lp-nav">
          <a href="#features">Features</a>
          <a href="#modules">Modules</a>
          <a href="#pricing">Pricing</a>
          <a href="#contact">Contact</a>
        </nav>
        <div className="lp-actions">
          <Link className="ghost" to="/login">Sign In</Link>
          <Link className="primary" to="/modules/waba/dashboard">Launch App</Link>
        </div>
      </header>

      <section className="lp-hero">
        <div>
          <p className="lp-kicker">Multi-Channel Communication Platform</p>
          <h1>Grow with WhatsApp + SMS automation on one multi-tenant platform.</h1>
          <p className="lp-sub">Built for agencies and businesses that need secure tenant isolation, embedded Meta onboarding, campaign orchestration, and real-time support inbox operations.</p>
          <div className="lp-cta-row">
            <Link className="primary" to="/login">Get Started</Link>
            <a className="ghost" href="#modules">Explore Modules</a>
          </div>
        </div>
        <aside className="lp-hero-card">
          <h3>Live Platform Snapshot</h3>
          <div className="lp-stat"><span>Tenants</span><b>126</b></div>
          <div className="lp-stat"><span>Messages / day</span><b>1.9M</b></div>
          <div className="lp-stat"><span>Delivery success</span><b>99.2%</b></div>
          <div className="lp-stat"><span>Active agents</span><b>342</b></div>
        </aside>
      </section>

      <section className="lp-band" id="features">
        {features.map((f) => (
          <article key={f.title} className="lp-feature">
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </article>
        ))}
      </section>

      <section className="lp-modules" id="modules">
        <article className="lp-module-card">
          <h2>WhatsApp Business Module</h2>
          <p>Embedded Signup, WABA linkage, templates lifecycle, session window logic, webhook security, and inbox for agent workflows.</p>
          <ul>
            <li>WABA onboarding and token exchange</li>
            <li>Template states + versioning controls</li>
            <li>Real-time conversations with assignment and notes</li>
          </ul>
        </article>
        <article className="lp-module-card">
          <h2>SMS Module</h2>
          <p>Template-driven campaigns, custom flow builder inputs, sender controls, and delivery operations from one centralized workspace.</p>
          <ul>
            <li>Campaign queue with retry/throttling</li>
            <li>Flow builder with reusable input definitions</li>
            <li>Channel-level analytics hooks</li>
          </ul>
        </article>
      </section>

      <section className="lp-pricing" id="pricing">
        <h2>Simple plans for every growth stage</h2>
        <div className="lp-plan-grid">
          {plans.map((p) => (
            <article key={p.name} className="lp-plan">
              <h3>{p.name}</h3>
              <p className="lp-price">{p.price}<span>/mo</span></p>
              {p.points.map((pt) => <p key={pt}>{pt}</p>)}
              <Link className="primary" to="/login">Choose {p.name}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-final" id="contact">
        <h2>Ready to launch your tenant workspace?</h2>
        <p>Deploy Textzy with your own domains, onboarding, and messaging operations.</p>
        <Link className="primary" to="/login">Book Demo / Login</Link>
      </section>

      <footer className="lp-footer">
        <span>© {new Date().getFullYear()} Textzy</span>
        <div>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#contact">Contact</a>
        </div>
      </footer>
    </main>
  )
}
