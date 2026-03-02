const runtimeConfig = typeof window !== 'undefined' ? (window.__APP_CONFIG__ || {}) : {}
const API_BASE =
  runtimeConfig.API_BASE ||
  import.meta.env.VITE_API_BASE ||
  process.env.REACT_APP_API_BASE ||
  'https://textzy-backend-production.up.railway.app'

let getSession = () => ({ tenantSlug: '' })
let onSessionUpdate = () => {}
let onAuthFailure = () => {}
let refreshPromise = null
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function readCsrfToken() {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/(?:^|;\s*)textzy_csrf=([^;]+)/)
  if (!m || !m[1]) return ''
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

export function configureApiClient({ getSessionFn, onSessionUpdateFn, onAuthFailureFn }) {
  getSession = getSessionFn || getSession
  onSessionUpdate = onSessionUpdateFn || onSessionUpdate
  onAuthFailure = onAuthFailureFn || onAuthFailure
}

async function baseFetch(path, options = {}, useAuth = true) {
  const { tenantSlug, accessToken } = getSession()
  const headers = {
    ...(options.headers || {})
  }
  const method = (options.method || 'GET').toUpperCase()
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug
  if (useAuth && accessToken && !headers.Authorization) headers.Authorization = `Bearer ${accessToken}`

  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  if (UNSAFE_METHODS.has(method) && !headers['X-CSRF-Token']) {
    const csrfToken = readCsrfToken()
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken
  }

  return fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
}

async function refreshToken() {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const res = await baseFetch('/api/auth/refresh', { method: 'POST' }, true)
    if (!res.ok) return false
    await res.json().catch(() => ({}))
    return true
  })()
  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
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
    credentials: 'include',
    body: JSON.stringify({ email, password })
  })

  if (!res.ok) throw new Error('Invalid login')
  const data = await res.json()
  if (data?.accessToken && typeof onSessionUpdate === 'function') onSessionUpdate({ accessToken: data.accessToken })
  return data
}

export async function getWabaStatus() {
  return apiGet('/api/waba/status')
}

export async function exchangeEmbeddedSignupCode(code) {
  return apiPost('/api/waba/embedded-signup/exchange', { code })
}

export async function getEmbeddedSignupConfig() {
  return apiGet('/api/waba/embedded-config')
}
