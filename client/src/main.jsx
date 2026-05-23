import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { LanguageProvider } from './LanguageContext'
import { ThemeProvider } from './ThemeContext'
import './index.css'

// Auto-reload on stale chunk error (unhandled promise rejection path).
// Uses a retry counter (max 3) instead of a time-based TTL so rapid
// deployments don't leave users stuck on a stale version.
const CHUNK_ERR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'Unable to preload CSS',
  'error loading dynamically imported module',
  'ChunkLoadError',
  'Load failed',
]
const MAX_AUTO_RETRIES = 3
const RETRY_KEY = 'wl_chunk_retry'
function chunkReload() {
  try {
    const n = parseInt(sessionStorage.getItem(RETRY_KEY) || '0', 10)
    if (n >= MAX_AUTO_RETRIES) return
    sessionStorage.setItem(RETRY_KEY, String(n + 1))
  } catch {}
  if ('caches' in window) {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => window.location.reload())
  } else {
    window.location.reload()
  }
}
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || ''
  if (CHUNK_ERR_PATTERNS.some(p => msg.includes(p))) chunkReload()
})

// Reload when SW signals a 404 on a hashed asset (new deployment replaced old chunks).
// Always reload on SW signal — the SW only fires this once per chunk miss.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'CHUNK_404') chunkReload()
  })
}

const basename = window.location.hostname.endsWith('github.io') ? '/Walletlens' : '/'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <ThemeProvider>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </ThemeProvider>
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
