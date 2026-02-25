import { toast } from 'sonner'

const runtimeConfig = typeof window !== 'undefined' ? (window.__APP_CONFIG__ || {}) : {}
const API_BASE =
  runtimeConfig.API_BASE ||
  process.env.REACT_APP_API_BASE ||
  process.env.VITE_API_BASE ||
  'https://textzy.onrender.com'
const STORAGE_KEY = 'textzy.session'

export function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { tenantSlug: '', role: '', email: '' }
    const p = JSON.parse(raw)
    return {
      tenantSlug: p.tenantSlug || p.slug || '',
      projectName: p.projectName || '',
      role: p.role || '',
      email: p.email || ''
    }
  } catch {
    return { tenantSlug: '', projectName: '', role: '', email: '' }
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
  const tenantOptionalPrefixes = [
    '/api/auth/',
    '/api/public/',
    '/api/platform/',
    '/api/payment/webhooks'
  ]
  const requiresTenant = useAuth && !tenantOptionalPrefixes.some((p) => path.startsWith(p))
  if (s.tenantSlug) headers['X-Tenant-Slug'] = s.tenantSlug
  if (requiresTenant && !headers['X-Tenant-Slug']) {
    if (typeof window !== 'undefined' && window.location.pathname !== '/projects') {
      window.location.assign('/projects')
    }
    throw new Error('Missing tenant context. Please select project.')
  }

  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  return fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
}

async function refresh() {
  const res = await baseFetch('/api/auth/refresh', { method: 'POST' }, true)
  if (!res.ok) return false
  await res.json().catch(() => ({}))
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
  const headers = {}
  if (path === '/api/messages/send') {
    headers['Idempotency-Key'] = body?.idempotencyKey || buildIdempotencyKey('msg')
  }
  const res = await apiRequest(path, { method: 'POST', headers, body: JSON.stringify(body) })
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

export async function apiPatch(path, body) {
  const res = await apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(msg || `PATCH ${path} failed (${res.status})`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export async function apiDelete(path) {
  const res = await apiRequest(path, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) throw new Error(`DELETE ${path} failed (${res.status})`)
  return true
}

export function buildIdempotencyKey(prefix = "msg") {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${rand}`;
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
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(msg || 'Invalid login')
  }
  return res.json()
}

export async function authAcceptInvite({ token, fullName, password }) {
  const res = await fetch(`${API_BASE}/api/auth/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token, fullName, password })
  })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(msg || 'Failed to accept invite')
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
  setSession({
    tenantSlug: data?.slug || '',
    projectName: data?.name || '',
    role: data?.role || 'owner'
  })
  return data
}

export async function switchProject(slug) {
  const data = await apiPost('/api/auth/switch-project', { slug })
  setSession({
    tenantSlug: data?.tenantSlug || slug,
    projectName: data?.projectName || '',
    role: data?.role || ''
  })
  return data
}

export function requireAuthOrRedirect(navigate) {
  const s = getSession()
  if (!s.email) {
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

export async function wabaGetEmbeddedConfig() {
  return apiGet('/api/waba/embedded-config')
}

export async function wabaRecheckOnboarding() {
  return apiPost('/api/waba/onboarding/recheck', {})
}

export async function wabaReuseExisting(code, wabaId = '', phoneNumberId = '') {
  return apiPost('/api/waba/onboarding/reuse-existing', { code, wabaId, phoneNumberId })
}

export async function getPlatformSettings(scope) {
  return apiGet(`/api/platform/settings/${scope}`)
}

export async function savePlatformSettings(scope, values) {
  return apiPut(`/api/platform/settings/${scope}`, values)
}

export async function listSmsSenders() {
  try {
    return await apiGet('/api/sms/senders')
  } catch (e) {
    return apiGet('/api/sms/sender')
  }
}

export async function createSmsSender(payload) {
  try {
    return await apiPost('/api/sms/senders', payload)
  } catch (e) {
    return apiPost('/api/sms/sender', payload)
  }
}

export async function getPlatformWebhookLogs({ provider = "", limit = 100 } = {}) {
  const q = new URLSearchParams()
  if (provider) q.set("provider", provider)
  q.set("limit", String(limit))
  return apiGet(`/api/platform/webhook-logs?${q.toString()}`)
}

export async function getPlatformRequestLogs({ tenantId = "", method = "", statusCode = "", pathContains = "", limit = 200 } = {}) {
  const q = new URLSearchParams()
  if (tenantId) q.set("tenantId", tenantId)
  if (method) q.set("method", method)
  if (statusCode) q.set("statusCode", String(statusCode))
  if (pathContains) q.set("pathContains", pathContains)
  q.set("limit", String(limit))
  return apiGet(`/api/platform/request-logs?${q.toString()}`)
}

export async function getPlatformQueueHealth() {
  return apiGet('/api/platform/queue-health')
}

export async function getPlatformSecuritySignals({ status = "open", limit = 100 } = {}) {
  const q = new URLSearchParams()
  if (status) q.set("status", status)
  q.set("limit", String(limit))
  return apiGet(`/api/platform/security/signals?${q.toString()}`)
}

export async function resolvePlatformSecuritySignal(id) {
  return apiPost(`/api/platform/security/signals/${id}/resolve`, {})
}

export async function getPlatformSecurityControls(tenantId) {
  const q = new URLSearchParams()
  q.set("tenantId", tenantId)
  return apiGet(`/api/platform/security/controls?${q.toString()}`)
}

export async function upsertPlatformSecurityControls(payload) {
  return apiPut("/api/platform/security/controls", payload)
}

export async function purgePlatformQueue(queue) {
  return apiPost("/api/platform/security/queue/purge", { queue })
}

export async function listWabaErrorPolicies() {
  return apiGet('/api/platform/waba-error-policies')
}

export async function upsertWabaErrorPolicy(payload) {
  return apiPost('/api/platform/waba-error-policies', payload)
}

export async function deactivateWabaErrorPolicy(code) {
  return apiDelete(`/api/platform/waba-error-policies/${encodeURIComponent(code)}`)
}

export async function getPlatformWebhookAnalytics(tenantId = '', days = 7) {
  const q = new URLSearchParams()
  if (tenantId) q.set('tenantId', tenantId)
  q.set('days', String(days))
  return apiGet(`/api/platform/webhook-analytics?${q.toString()}`)
}

export async function getPlatformWabaOnboardingSummary() {
  return apiGet('/api/platform/waba/onboarding-summary')
}

export async function cancelPlatformWabaRequest(tenantId, reason = '') {
  return apiPost('/api/platform/waba/cancel-request', { tenantId, reason })
}

export async function platformLookupByPhone(tenantId, phoneNumberId) {
  const q = new URLSearchParams()
  if (tenantId) q.set('tenantId', tenantId)
  q.set('phoneNumberId', phoneNumberId)
  return apiGet(`/api/platform/waba/lookup/by-phone?${q.toString()}`)
}

export async function platformLookupByWaba(tenantId, wabaId) {
  const q = new URLSearchParams()
  if (tenantId) q.set('tenantId', tenantId)
  q.set('wabaId', wabaId)
  return apiGet(`/api/platform/waba/lookup/by-waba?${q.toString()}`)
}

export async function getTenantWebhookAnalytics(days = 7) {
  const q = new URLSearchParams()
  q.set('days', String(days))
  return apiGet(`/api/analytics/webhook?${q.toString()}`)
}

export async function getTenantIdempotencyDiagnostics({ status = '', staleMinutes = 30, limit = 200 } = {}) {
  const q = new URLSearchParams()
  if (status) q.set('status', status)
  q.set('staleMinutes', String(staleMinutes))
  q.set('limit', String(limit))
  return apiGet(`/api/idempotency/diagnostics?${q.toString()}`)
}

export async function getPlatformIdempotencyDiagnostics({ tenantId, status = '', staleMinutes = 30, limit = 300 } = {}) {
  const q = new URLSearchParams()
  if (tenantId) q.set('tenantId', tenantId)
  if (status) q.set('status', status)
  q.set('staleMinutes', String(staleMinutes))
  q.set('limit', String(limit))
  return apiGet(`/api/platform/idempotency-diagnostics?${q.toString()}`)
}

export async function listPaymentWebhooks() {
  return apiGet('/api/platform/payment-webhooks')
}

export async function autoCreatePaymentWebhook(provider) {
  return apiPost('/api/platform/payment-webhooks/auto-create', { provider })
}

export async function upsertPaymentWebhook(payload) {
  return apiPut('/api/platform/payment-webhooks', payload)
}

export async function listPlatformBillingPlans() {
  return apiGet('/api/platform/billing/plans')
}

export async function createPlatformBillingPlan(payload) {
  return apiPost('/api/platform/billing/plans', payload)
}

export async function updatePlatformBillingPlan(id, payload) {
  return apiPut(`/api/platform/billing/plans/${id}`, payload)
}

export async function getPlatformCustomers(q = '') {
  const qs = new URLSearchParams()
  if (q) qs.set('q', q)
  return apiGet(`/api/platform/customers${qs.toString() ? `?${qs.toString()}` : ''}`)
}

export async function getPlatformCustomerDetails(tenantId) {
  return apiGet(`/api/platform/customers/${tenantId}`)
}

export async function getPlatformCustomerUsage(tenantId, month = '') {
  const qs = new URLSearchParams()
  if (month) qs.set('month', month)
  return apiGet(`/api/platform/customers/${tenantId}/usage${qs.toString() ? `?${qs.toString()}` : ''}`)
}

export async function getPlatformCustomerSubscriptions(tenantId) {
  return apiGet(`/api/platform/customers/${tenantId}/subscriptions`)
}

export async function getPlatformCustomerInvoices(tenantId) {
  return apiGet(`/api/platform/customers/${tenantId}/invoices`)
}

export async function getPlatformCustomerMembers(tenantId) {
  return apiGet(`/api/platform/customers/${tenantId}/members`)
}

export async function getPlatformCustomerActivity(tenantId, limit = 100) {
  return apiGet(`/api/platform/customers/${tenantId}/activity?limit=${encodeURIComponent(limit)}`)
}

export async function archivePlatformBillingPlan(id) {
  return apiDelete(`/api/platform/billing/plans/${id}`)
}

export async function getBillingPlans() {
  return apiGet('/api/billing/plans')
}

export async function getCurrentBillingPlan() {
  return apiGet('/api/billing/current-plan')
}

export async function getBillingUsage() {
  return apiGet('/api/billing/usage')
}

export async function getBillingInvoices() {
  return apiGet('/api/billing/invoices')
}

export async function changeBillingPlan(planCode, billingCycle = 'monthly') {
  return apiPost('/api/billing/change-plan', { planCode, billingCycle })
}

export async function cancelBillingSubscription() {
  return apiPost('/api/billing/cancel', {})
}

export async function getBillingPaymentConfig() {
  return apiGet('/api/billing/payment-config')
}

export async function createRazorpayOrder(planCode, billingCycle = 'monthly') {
  return apiPost('/api/billing/razorpay/create-order', { planCode, billingCycle })
}

export async function verifyRazorpayPayment(payload) {
  return apiPost('/api/billing/razorpay/verify', payload)
}

export async function getPublicPlans() {
  const res = await fetch(`${API_BASE}/api/public/plans`)
  if (!res.ok) throw new Error(`GET /api/public/plans failed (${res.status})`)
  return res.json()
}
