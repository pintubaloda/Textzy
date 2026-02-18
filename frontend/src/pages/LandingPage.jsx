import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <main className="page-wrap">
      <section className="panel dark" style={{ maxWidth: 720, margin: '60px auto' }}>
        <h1>Textzy Platform</h1>
        <p>Secure multi-tenant WABA + SMS platform with session-based opaque token auth.</p>
        <div className="actions">
          <Link className="primary" to="/login">Login</Link>
          <Link className="ghost" to="/modules/waba/frames">View Design Frames</Link>
        </div>
      </section>
    </main>
  )
}
