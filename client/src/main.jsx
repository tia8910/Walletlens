import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { LanguageProvider } from './LanguageContext'
import { ThemeProvider } from './ThemeContext'
import { initAutoTrack } from './analytics'
import { initVitals } from './vitals'
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
    // Only nuke API/versioned caches — preserve the static-asset cache (so the
    // reload doesn't re-download every hashed JS/CSS chunk) AND the
    // version-independent CDN cache (up to 500 coin icons that never change).
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith('walletlens-static-') && !k.startsWith('walletlens-cdn-'))
          .map(k => caches.delete(k))
      ))
      .finally(() => window.location.reload())
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

// Intercept QR deep-link import before React renders — no UI flash.
// Scanning the exported QR with any camera app opens walletlens.live/?wqi=...
// We stash the code in sessionStorage and redirect to /dashboard so the
// DataPanel can auto-trigger the import preview on mount.
;(function interceptQrImport() {
  try {
    const params = new URLSearchParams(window.location.search)
    const wqi = params.get('wqi')
    if (!wqi) return
    const b64 = wqi.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - wqi.length % 4) % 4)
    sessionStorage.setItem('wl_pending_import', 'WLQS:' + b64)
    const url = new URL(window.location.href)
    url.searchParams.delete('wqi')
    // Redirect to dashboard data tab — replaceState keeps browser history clean
    window.history.replaceState({}, '', '/dashboard')
  } catch {}
})()

const basename = window.location.hostname.endsWith('github.io') ? '/Walletlens' : '/'

// Auto-track every click / selection across the app in GA.
initAutoTrack()
// Report Core Web Vitals (LCP, INP, CLS, FCP, TTFB) to GA4.
initVitals()

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
// reliably and walletlens.live is the primary install target.
if ('serviceWorker' in navigator && basename === '/') {
  // When a new SW takes control (it calls skipWaiting + clients.claim on
  // deploy), the already-loaded page is still running the OLD bundles. Reload
  // once so the user lands on the freshly deployed code without manual cache
  // clearing. Guarded by `hadController` so the first-ever install (page starts
  // uncontrolled) doesn't trigger a needless reload, and by `refreshing` so we
  // never loop.
  const hadController = !!navigator.serviceWorker.controller
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return
    refreshing = true
    window.location.reload()
  })

  // Auto-apply a ready update — no banner. If a new worker is waiting (the SW
  // also calls skipWaiting() itself, but a worker can still land in "waiting"
  // on some browsers/timing), tell it to take over now; the controllerchange
  // handler above then reloads the page onto the new build. Only for a real
  // update (there's already a controller), never the first-ever install.
  const applyUpdate = (reg) => {
    if (reg?.waiting && navigator.serviceWorker.controller) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // A new worker may already be waiting from a previous visit.
      applyUpdate(reg)
      // Or one may finish installing while this tab is open.
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        if (!nw) return
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed') applyUpdate(reg)
        })
      })
      // Actively check for a new SW now and whenever the tab regains focus, so
      // returning/long-lived sessions pick up new deployments promptly instead
      // of waiting on the browser's once-a-day background check.
      reg.update().catch(() => {})
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    }).catch(() => {})
  })
}

const _deployId = "178415073";
