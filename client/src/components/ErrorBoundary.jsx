import { Component } from 'react'

const isChunkError = (msg = '') =>
  msg.includes('Failed to fetch dynamically imported module') ||
  msg.includes('Importing a module script failed') ||
  msg.includes('Unable to preload CSS') ||
  msg.includes('error loading dynamically imported module') ||
  msg.includes('Loading chunk') ||
  msg.includes('ChunkLoadError') ||
  msg.includes('Load failed')

const RELOAD_KEY = 'wl_chunk_reload'
const RELOAD_TTL = 30_000

function clearCachesAndReload() {
  if ('caches' in window) {
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .finally(() => window.location.reload())
  } else {
    window.location.reload()
  }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '', isChunk: false }
  }

  static getDerivedStateFromError(err) {
    const msg = err?.message || 'Unexpected error'
    const chunk = isChunkError(msg)
    return { hasError: true, message: msg, isChunk: chunk }
  }

  componentDidCatch(err, info) {
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary]', err, info?.componentStack)
    }
    if (this.state.isChunk) {
      const last = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10)
      if (Date.now() - last > RELOAD_TTL) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
        clearCachesAndReload()
      }
      // If within TTL, leave the UI visible so the user can tap Reload manually
    }
  }

  reset = () => this.setState({ hasError: false, message: '', isChunk: false })

  hardReload = () => {
    sessionStorage.removeItem(RELOAD_KEY)
    clearCachesAndReload()
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="page" role="alert">
        <div className="card">
          <h3 style={{ marginBottom: '0.5rem' }}>Something broke on this page</h3>
          <p className="muted" style={{ marginBottom: '1rem' }}>
            {this.state.isChunk
              ? 'A new version of the app was deployed. Tap "Reload" to get the latest.'
              : this.state.message}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={this.state.isChunk ? this.hardReload : this.reset}>
              {this.state.isChunk ? 'Reload' : 'Try again'}
            </button>
            <button onClick={this.hardReload} style={{ background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)' }}>
              Reload app
            </button>
          </div>
        </div>
      </div>
    )
  }
}
