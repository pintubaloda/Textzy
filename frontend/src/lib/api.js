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
      role: p.role || '',
      email: p.email || ''
    }
  } catch {
    return { token: '', tenantSlug: '', role: '', email: '' }
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
  if (!res.ok) throw new Error(`POST ${path} failed (${res.status})`)
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
    setSession({ role: me.role || '', email: me.email || '' })
    return me
  } catch {
    return null
  }
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
