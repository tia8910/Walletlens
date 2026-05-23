import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { LanguageProvider } from './LanguageContext'
import { ThemeProvider } from './ThemeContext'
import './index.css'

// Auto-reload on stale chunk error (unhandled promise rejection path)
const CHUNK_ERR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'Unable to preload CSS',
  'error loading dynamically imported module',
  'ChunkLoadError',
  'Load failed',
]
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || ''
  if (CHUNK_ERR_PATTERNS.some(p => msg.includes(p))) {
    const last = parseInt(sessionStorage.getItem('wl_chunk_reload') || '0', 10)
    if (Date.now() - last > 30_000) {
      sessionStorage.setItem('wl_chunk_reload', String(Date.now()))
      if ('caches' in window) {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => window.location.reload())
      } else {
        window.location.reload()
      }
    }
  }
})

// Reload when SW signals a 404 on a hashed asset (new deployment replaced old chunks)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'CHUNK_404') {
      sessionStorage.setItem('wl_chunk_reload', String(Date.now()))
      if ('caches' in window) {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => window.location.reload())
      } else {
        window.location.reload()
      }
    }
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
