import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { LanguageProvider } from './LanguageContext'
import './index.css'

// Auto-reload on stale chunk error (happens when a new deployment replaces old chunk files)
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.message?.includes('Failed to fetch dynamically imported module') ||
      e.reason?.message?.includes('Importing a module script failed')) {
    window.location.reload()
  }
})

const basename = window.location.hostname.endsWith('github.io') ? '/Walletlens' : '/'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
)

// Register the service worker after first paint. Skipped on the
// /Walletlens/ subpath since GitHub Pages doesn't serve it from there
// reliably and Cloudflare/walletlens.cc is the primary install target.
if ('serviceWorker' in navigator && basename === '/') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
