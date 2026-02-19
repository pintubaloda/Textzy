const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

let getSession = () => ({ token: '', tenantSlug: '' })
let onSessionUpdate = () => {}
let onAuthFailure = () => {}

export function configureApiClient({ getSessionFn, onSessionUpdateFn, onAuthFailureFn }) {
  getSession = getSessionFn || getSession
  onSessionUpdate = onSessionUpdateFn || onSessionUpdate
  onAuthFailure = onAuthFailureFn || onAuthFailure
}

async function baseFetch(path, options = {}, useAuth = true) {
  const { token, tenantSlug } = getSession()
  const headers = {
    ...(options.headers || {})
  }
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug

  if (useAuth && token) headers.Authorization = `Bearer ${token}`
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  return fetch(`${API_BASE}${path}`, { ...options, headers })
}

async function refreshToken() {
  const res = await baseFetch('/api/auth/refresh', { method: 'POST' }, true)
  if (!res.ok) return false
  const data = await res.json()
  onSessionUpdate({ token: data.accessToken })
  return true
}

export async function apiRequest(path, options = {}) {
  let res = await baseFetch(path, options, true)
  if (res.status !== 401) return res

  const refreshed = await refreshToken()
  if (!refreshed) {
    onAuthFailure()
    return res
  }

  res = await baseFetch(path, options, true)
  if (res.status === 401) onAuthFailure()
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

export async function apiPostForm(path, formData) {
  const res = await apiRequest(path, { method: 'POST', body: formData, headers: {} })
  if (!res.ok) throw new Error(`POST ${path} failed (${res.status})`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export async function authLogin({ email, password, tenantSlug }) {
  const headers = { 'Content-Type': 'application/json' }
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password })
  })

  if (!res.ok) throw new Error('Invalid login')
  return res.json()
}

export async function getWabaStatus() {
  return apiGet('/api/waba/status')
}

export async function exchangeEmbeddedSignupCode(code) {
  return apiPost('/api/waba/embedded-signup/exchange', { code })
}
