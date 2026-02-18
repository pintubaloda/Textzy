import { useEffect, useMemo, useState } from 'react'
import { apiGet, exchangeEmbeddedSignupCode, getWabaStatus } from '../../../api/client'
import { useToast } from '../../../feedback/ToastProvider'
import WabaShell from '../../../components/waba/WabaShell'

function loadFacebookSdk(appId) {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB)
    window.fbAsyncInit = function () {
      window.FB.init({ appId, cookie: true, xfbml: false, version: 'v21.0' })
      resolve(window.FB)
    }
    const script = document.createElement('script')
    script.async = true
    script.defer = true
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.onerror = reject
    document.body.appendChild(script)
  })
}

export default function WabaDashboardPage() {
  const toast = useToast()
  const [counts, setCounts] = useState({ total: 0, sent: 0, pending: 0 })
  const [waba, setWaba] = useState({ isConnected: false })
  const [loadingWaba, setLoadingWaba] = useState(false)
  const [graphProbe, setGraphProbe] = useState(null)

  const embeddedConfigId = import.meta.env.VITE_WABA_EMBEDDED_CONFIG_ID || ''
  const facebookAppId = import.meta.env.VITE_FACEBOOK_APP_ID || ''

  const statusText = useMemo(() => (waba.isConnected ? 'Connected' : 'Pending'), [waba.isConnected])

  async function loadDashboard() {
    const items = await apiGet('/api/messages')
    const total = items.length
    const sent = items.filter((x) => x.status === 'Accepted').length
    const pending = total - sent
    setCounts({ total, sent, pending })
  }

  async function loadWabaStatus() {
    try {
      const s = await getWabaStatus()
      setWaba(s)
    } catch {
      setWaba({ isConnected: false })
    }
  }

  useEffect(() => {
    loadDashboard().catch(() => setCounts({ total: 0, sent: 0, pending: 0 }))
    loadWabaStatus()
    apiGet('/api/waba/debug/tenant-probe').then(setGraphProbe).catch(() => setGraphProbe(null))
  }, [])

  async function startEmbeddedSignup() {
    if (!facebookAppId || !embeddedConfigId) {
      toast.error('Missing VITE_FACEBOOK_APP_ID or VITE_WABA_EMBEDDED_CONFIG_ID')
      return
    }

    setLoadingWaba(true)
    try {
      const FB = await loadFacebookSdk(facebookAppId)
      FB.login(async (response) => {
        if (!response || !response.authResponse) {
          toast.error('Embedded signup cancelled')
          setLoadingWaba(false)
          return
        }

        try {
          // In embedded signup flow, backend should exchange auth code.
          // Here we use accessToken fallback if code is unavailable in popup callback.
          const codeOrToken = response.authResponse.code || response.authResponse.accessToken
          await exchangeEmbeddedSignupCode(codeOrToken)
          toast.success('WhatsApp business onboarding connected')
          await loadWabaStatus()
        } catch {
          toast.error('Failed to exchange embedded signup code')
        } finally {
          setLoadingWaba(false)
        }
      }, {
        config_id: embeddedConfigId,
        response_type: 'code',
        override_default_response_type: true,
        scope: 'business_management,whatsapp_business_management,whatsapp_business_messaging'
      })
    } catch {
      setLoadingWaba(false)
      toast.error('Facebook SDK load failed')
    }
  }

  return (
    <WabaShell>
      <div className="waba-topbar">
        <div className="pill">WhatsApp Business API Status: <b>{statusText}</b></div>
        <button className="primary" onClick={startEmbeddedSignup} disabled={loadingWaba}>
          {loadingWaba ? 'Connecting...' : (waba.isConnected ? 'Reconnect' : 'Apply Now')}
        </button>
      </div>

      <div className="waba-grid">
        <article className="panel dark">
          <h2>Setup FREE WhatsApp Business Account</h2>
          <div className="row">Apply for WhatsApp Business API</div>
          <p>Click on Continue With Facebook to apply for WhatsApp Business API.</p>
          <p>Requirements: registered business + working website + Meta verification.</p>
          <div className="actions">
            <button className="ghost">Schedule Meeting</button>
            <button className="primary" onClick={startEmbeddedSignup} disabled={loadingWaba}>
              {loadingWaba ? 'Please wait...' : 'Continue with facebook'}
            </button>
          </div>
        </article>

        <article className="panel dark center">
          <h3>{waba.businessName || 'Business not connected'}</h3>
          <p>{waba.phone || 'No number linked yet'}</p>
          <p>{waba.wabaId ? `WABA ID: ${waba.wabaId}` : 'WABA ID pending'}</p>
          <p>{graphProbe?.connected ? 'Graph probe: OK' : 'Graph probe: unavailable'}</p>
        </article>
      </div>

      <div className="stats-grid">
        <article className="stat stat1"><h3>Total</h3><p>{counts.total} Message</p></article>
        <article className="stat stat2"><h3>Sent</h3><p>{counts.sent} Message</p></article>
        <article className="stat stat3"><h3>Pending</h3><p>{counts.pending} Message</p></article>
      </div>
    </WabaShell>
  )
}
