import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({
    email: 'admin@textzy.local',
    password: 'ChangeMe@123',
    tenantSlug: 'demo-retail'
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form)
      navigate('/modules/waba/dashboard', { replace: true })
    } catch {
      setError('Login failed. Check email/password/tenant.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page-wrap">
      <section className="panel dark" style={{ maxWidth: 460, margin: '40px auto' }}>
        <h1>Sign In</h1>
        <p>Session-based auth with opaque token</p>
        <form className="campaign-form" onSubmit={submit}>
          <label>Email</label>
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <label>Password</label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <label>Tenant</label>
          <select value={form.tenantSlug} onChange={(e) => setForm({ ...form, tenantSlug: e.target.value })}>
            <option value="demo-retail">demo-retail</option>
            <option value="demo-d2c">demo-d2c</option>
          </select>
          {error && <p style={{ color: '#ffb3b3' }}>{error}</p>}
          <button className="primary" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>
      </section>
    </main>
  )
}
