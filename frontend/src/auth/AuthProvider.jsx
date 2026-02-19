import { createContext, useContext, useMemo, useState } from 'react'
import { apiGet, apiPost, authLogin, configureApiClient } from '../api/client'

const AuthContext = createContext(null)

const SESSION_KEY = 'textzy.session'

function readSession() {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return { token: '', tenantSlug: '', role: '', email: '' }
  try {
    return JSON.parse(raw)
  } catch {
    return { token: '', tenantSlug: '', role: '', email: '' }
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession)

  function persist(next) {
    setSession((prev) => {
      const merged = { ...prev, ...next }
      localStorage.setItem(SESSION_KEY, JSON.stringify(merged))
      return merged
    })
  }

  function clearSession() {
    const empty = { token: '', tenantSlug: '', role: '', email: '' }
    setSession(empty)
    localStorage.setItem(SESSION_KEY, JSON.stringify(empty))
  }

  configureApiClient({
    getSessionFn: () => session,
    onSessionUpdateFn: (next) => persist(next),
    onAuthFailureFn: () => clearSession()
  })

  async function login({ email, password }) {
    const loginRes = await authLogin({ email, password })
    persist({ token: loginRes.accessToken })
    const me = await apiGet('/api/auth/me')
    persist({ role: me.role, email: me.email, tenantSlug: me.tenantSlug || '' })
  }

  async function logout() {
    try {
      await apiPost('/api/auth/logout', {})
    } finally {
      clearSession()
    }
  }

  const value = useMemo(() => ({
    session,
    isAuthenticated: Boolean(session.token),
    login,
    logout,
    setTenantSlug: () => {}
  }), [session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
