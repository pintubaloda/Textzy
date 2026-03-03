import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App'
import { AuthProvider } from './auth/AuthProvider'
import { ToastProvider } from './feedback/ToastProvider'
import TextzyApp from './textzy-app'
import TextzyMobile from './textzy-mobile'
import './styles/global.css'

const params = new URLSearchParams(window.location.search)
const desktopShell = params.get('desktopShell') === '1'
const mobileShell =
  params.get('mobileShell') === '1' ||
  window.location.pathname.startsWith('/mobile-shell') ||
  window.location.href.includes('mobileShell=1') ||
  window.location.hash.toLowerCase().includes('mobileshell') ||
  window.location.hash.toLowerCase().includes('mobile-shell') ||
  window.navigator.userAgent.includes('TextzyMobileShell/1')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {mobileShell ? (
      <TextzyMobile />
    ) : desktopShell ? (
      <TextzyApp />
    ) : (
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    )}
  </React.StrictMode>
)
