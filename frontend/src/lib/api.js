import { toast } from 'sonner'

const API_BASE = process.env.REACT_APP_API_BASE || 'https://textzy.onrender.com'
const STORAGE_KEY = 'textzy.session.v1'

export function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { token: '', tenantSlug: '', role: '', email: '' }
    const p = JSON.parse(raw)
    return {
      token: p.token || '',
      tenantSlug: p.tenantSlug || '',
      projectName: p.projectName || '',
      role: p.role || '',
      email: p.email || ''
    }
  } catch {
    return { token: '', tenantSlug: '', projectName: '', role: '', email: '' }
  }
}

export function setSession(next) {
  const current = getSession()
  const merged = { ...current, ...next }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  return merged
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
}

async function baseFetch(path, options = {}, useAuth = true) {
  const s = getSession()
  const headers = {
    ...(options.headers || {})
  }
  if (s.tenantSlug) headers['X-Tenant-Slug'] = s.tenantSlug

  if (useAuth && s.token) headers.Authorization = `Bearer ${s.token}`
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  return fetch(`${API_BASE}${path}`, { ...options, headers })
}

async function refresh() {
  const res = await baseFetch('/api/auth/refresh', { method: 'POST' }, true)
  if (!res.ok) return false
  const data = await res.json()
  setSession({ token: data.accessToken })
  return true
}

export async function apiRequest(path, options = {}) {
  let res = await baseFetch(path, options, true)
  if (res.status !== 401) return res
  const ok = await refresh()
  if (!ok) return res
  res = await baseFetch(path, options, true)
  return res
}

export async function apiGet(path) {
  const res = await apiRequest(path)
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status})`)
  return res.json()
}

export async function apiPost(path, body) {
  const res = await apiRequest(path, { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(msg || `POST ${path} failed (${res.status})`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export async function apiPut(path, body) {
  const res = await apiRequest(path, { method: 'PUT', body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`PUT ${path} failed (${res.status})`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export async function apiDelete(path) {
  const res = await apiRequest(path, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) throw new Error(`DELETE ${path} failed (${res.status})`)
  return true
}

export async function authLogin({ email, password, tenantSlug }) {
  const headers = { 'Content-Type': 'application/json' }
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password })
  })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(msg || 'Invalid login')
  }
  return res.json()
}

export async function initializeMe() {
  try {
    const me = await apiGet('/api/auth/me')
    setSession({ role: me.role || '', email: me.email || '', tenantSlug: me.tenantSlug || '' })
    return me
  } catch {
    return null
  }
}

export async function authProjects() {
  return apiGet('/api/auth/projects')
}

export async function createProject(name) {
  const data = await apiPost('/api/auth/projects', { name })
  if (data?.accessToken) {
    setSession({
      token: data.accessToken,
      tenantSlug: data.slug || '',
      projectName: data.name || '',
      role: data.role || 'owner'
    })
  }
  return data
}

export async function switchProject(slug) {
  const data = await apiPost('/api/auth/switch-project', { slug })
  if (data?.accessToken) {
    setSession({
      token: data.accessToken,
      tenantSlug: data.tenantSlug || slug,
      projectName: data.projectName || '',
      role: data.role || ''
    })
  }
  return data
}

export function requireAuthOrRedirect(navigate) {
  const s = getSession()
  if (!s.token) {
    navigate('/login')
    return false
  }
  return true
}

export function notifyApiError(message) {
  toast.error(message)
}

export async function wabaStartOnboarding() {
  return apiPost('/api/waba/onboarding/start', {})
}

export async function wabaGetOnboardingStatus() {
  return apiGet('/api/waba/onboarding/status')
}

export async function wabaExchangeCode(code) {
  return apiPost('/api/waba/embedded-signup/exchange', { code })
}

export async function wabaRecheckOnboarding() {
  return apiPost('/api/waba/onboarding/recheck', {})
}

export async function getPlatformSettings(scope) {
  return apiGet(`/api/platform/settings/${scope}`)
}

export async function savePlatformSettings(scope, values) {
  return apiPut(`/api/platform/settings/${scope}`, values)
}
