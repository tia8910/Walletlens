import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Use "/Walletlens" basename when served from tia8910.github.io/Walletlens/,
// "/" everywhere else (walletlens.cc, localhost, Cloudflare Pages preview URLs).
const basename = window.location.hostname.endsWith('github.io') ? '/Walletlens' : '/'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
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
