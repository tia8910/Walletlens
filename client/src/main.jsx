import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { LanguageProvider } from './LanguageContext'
import { ThemeProvider } from './ThemeContext'
import { initAutoTrack, initErrorTracking, initHumanSignal, setInterestSegments } from './analytics'
import { INTERESTS_EVENT } from './data/interestsEvent'
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
  let attempt = 0
  try {
    attempt = parseInt(sessionStorage.getItem(RETRY_KEY) || '0', 10)
    if (attempt >= MAX_AUTO_RETRIES) return
    sessionStorage.setItem(RETRY_KEY, String(attempt + 1))
  } catch {}

  if (!('caches' in window)) {
    window.location.reload()
    return
  }

  // The first attempts keep the static cache, so a reload does not re-download
  // every hashed chunk for what is usually a one-off miss.
  //
  // The last one must not. A stale shell pointing at chunks the server has
  // since deleted lives in exactly that cache, and preserving it means the
  // routine meant to recover from a bad chunk can never actually escape one:
  // it burns all three retries against the same broken copy and then gives up,
  // leaving the boot splash on screen forever. On the final attempt take the
  // cache and the worker with it and let the next load rebuild from network.
  const lastTry = attempt >= MAX_AUTO_RETRIES - 1
  const keep = k => !lastTry
    ? (!k.startsWith('walletlens-static-') && !k.startsWith('walletlens-cdn-'))
    : !k.startsWith('walletlens-cdn-')   // coin icons are content-addressed; they never go stale

  const work = [
    caches.keys().then(keys => Promise.all(keys.filter(keep).map(k => caches.delete(k)))),
  ]
  if (lastTry && 'serviceWorker' in navigator) {
    work.push(
      navigator.serviceWorker.getRegistrations()
        .then(rs => Promise.all(rs.map(r => r.unregister())))
        .catch(() => {})
    )
  }
  Promise.all(work).catch(() => {}).finally(() => window.location.reload())
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
// Report uncaught exceptions and failed asset loads.
initErrorTracking()
// Flag sessions that actually interacted, so crawler traffic can be segmented out.
initHumanSignal()
// Label this browser by the asset classes it asked for, so every later event
// can be read per segment. Set on every start, not only when the picker is
// answered: doing it only on answer labels the moment somebody chose and
// leaves every returning user — which is most of them — unsegmented.
setInterestSegments()
window.addEventListener(INTERESTS_EVENT, (e) => setInterestSegments(e.detail))
// Report Core Web Vitals (LCP, INP, CLS, FCP, TTFB) to GA4.
//
// Imported dynamically and started after first paint. A static import put the
// web-vitals library's parse and execute cost on the critical path — ahead of
// the first render — which is a measurable irony in the code whose job is
// measuring how fast the first render was. It now lands in its own chunk.
//
// requestIdleCallback where it exists, a timeout where it does not (Safari):
// the metrics are buffered by the library either way, so nothing is lost by
// subscribing late.
const startVitals = () => import('./vitals').then(m => m.initVitals()).catch(() => {})
if (typeof requestIdleCallback === 'function') requestIdleCallback(startVitals)
else setTimeout(startVitals, 1)

// The one-time handoff out of Chrome. Checked before anything mounts, because
// this tab was opened by the Android app for exactly one purpose — see
// handoff.js — and the rest of the app booting on top of it is at best noise
// and at worst a router redirect that loses the parameter.
//
// Loaded lazily and only when the parameter is present, so no browser pays for
// a migration screen that will never run in it.
if (handoffRequested()) {
  import('./handoff.js')
    .then(m => { if (!m.mountHandoff()) mountApp() })
    .catch(mountApp)
} else {
  mountApp()
}

/** The parameter check, inline so it costs nothing to ask. */
function handoffRequested() {
  try { return new URLSearchParams(location.search).get('wlhandoff') === '1' }
  catch { return false }
}

function mountApp() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter basename={basename}>
          <ThemeProvider>
            <LanguageProvider>
              <App />
            </LanguageProvider>
          </ThemeProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  )
}

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
  let pendingReload = false

  function reloadForUpdate() {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  }

  // Reload onto the new build while nobody is watching.
  //
  // This used to reload the moment a new worker took control. Combined with
  // the reg.update() below — which runs every time the app becomes visible —
  // that meant the reload landed almost exactly when someone reopened the app:
  // the dashboard blanked and rebuilt itself on every reopen following a
  // deploy. It reads as the holdings disappearing, and during a day of
  // frequent deploys it happens on essentially every return.
  //
  // So a reload that arrives while the app is on screen is deferred to the
  // next time the app leaves it. The user goes away, the page reloads unseen,
  // and they come back to the new build already drawn.
  //
  // Deferring is safe because the stale bundle only matters if it asks for a
  // chunk this deployment no longer has, and chunkReload() at the top of this
  // file already catches that import failure and reloads — at the one moment
  // where a reload is the honest thing to do.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return
    if (document.visibilityState === 'hidden') reloadForUpdate()
    else pendingReload = true
  })

  document.addEventListener('visibilitychange', () => {
    if (pendingReload && document.visibilityState === 'hidden') reloadForUpdate()
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
