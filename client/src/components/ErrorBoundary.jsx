import { Component } from 'react'

const isChunkError = (msg = '') =>
  msg.includes('Failed to fetch dynamically imported module') ||
  msg.includes('Importing a module script failed') ||
  msg.includes('Unable to preload CSS') ||
  msg.includes('error loading dynamically imported module')

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '', isChunk: false }
  }

  static getDerivedStateFromError(err) {
    const msg = err?.message || 'Unexpected error'
    const chunk = isChunkError(msg)
    // Auto-reload immediately on stale chunk — no UI flash
    if (chunk) {
      // Add a flag to avoid reload loop
      const reloadKey = 'wl_chunk_reload'
      const last = parseInt(sessionStorage.getItem(reloadKey) || '0', 10)
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(reloadKey, String(Date.now()))
        window.location.reload()
        return { hasError: false, message: '', isChunk: false }
      }
    }
    return { hasError: true, message: msg, isChunk: chunk }
  }

  componentDidCatch(err, info) {
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary]', err, info?.componentStack)
    }
  }

  reset = () => this.setState({ hasError: false, message: '', isChunk: false })

  hardReload = () => {
    // Clear SW cache then reload
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => window.location.reload())
    } else {
      window.location.reload()
    }
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
