import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App'
import { AuthProvider } from './auth/AuthProvider'
import { ToastProvider } from './feedback/ToastProvider'
import TextzyApp from './textzy-app'
import './styles/global.css'

const params = new URLSearchParams(window.location.search)
const desktopShell = params.get('desktopShell') === '1'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {desktopShell ? (
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
