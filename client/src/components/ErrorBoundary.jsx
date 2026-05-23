import { Component } from 'react'

const isChunkError = (msg = '') =>
  msg.includes('Failed to fetch dynamically imported module') ||
  msg.includes('Importing a module script failed') ||
  msg.includes('Unable to preload CSS') ||
  msg.includes('error loading dynamically imported module') ||
  msg.includes('Loading chunk') ||
  msg.includes('ChunkLoadError') ||
  msg.includes('Load failed')

const RETRY_KEY = 'wl_chunk_retry'
const MAX_AUTO_RETRIES = 3

function getRetryCount() {
  try { return parseInt(sessionStorage.getItem(RETRY_KEY) || '0', 10) } catch { return 0 }
}
function bumpRetryCount() {
  try { sessionStorage.setItem(RETRY_KEY, String(getRetryCount() + 1)) } catch {}
}
function clearRetryCount() {
  try { sessionStorage.removeItem(RETRY_KEY) } catch {}
}

function clearCachesAndReload() {
  bumpRetryCount()
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
    this.state = { hasError: false, message: '', isChunk: false, autoReloading: false }
  }

  static getDerivedStateFromError(err) {
    const msg = err?.message || 'Unexpected error'
    const chunk = isChunkError(msg)
    return { hasError: true, message: msg, isChunk: chunk }
  }

  componentDidCatch(err) {
    if (this.state.isChunk) {
      const retries = getRetryCount()
      if (retries < MAX_AUTO_RETRIES) {
        // Auto-reload silently — user sees a brief "Updating…" state
        this.setState({ autoReloading: true })
        clearCachesAndReload()
      }
      // else: exceeded retries, show manual UI
    }
  }

  reset = () => {
    clearRetryCount()
    this.setState({ hasError: false, message: '', isChunk: false, autoReloading: false })
  }

  hardReload = () => {
    clearRetryCount()
    clearCachesAndReload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    // Chunk error + still under retry limit → show quiet "Updating" screen
    if (this.state.isChunk && this.state.autoReloading) {
      return (
        <div className="page" role="status" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'2rem', marginBottom:'0.75rem' }}>⚡</div>
            <p style={{ fontWeight:700, marginBottom:'0.25rem' }}>Updating WalletLens…</p>
            <p className="muted" style={{ fontSize:'0.85rem' }}>Loading the latest version</p>
          </div>
        </div>
      )
    }

    return (
      <div className="page" role="alert">
        <div className="card">
          <h3 style={{ marginBottom: '0.5rem' }}>
            {this.state.isChunk ? '⚡ App updated' : 'Something went wrong'}
          </h3>
          <p className="muted" style={{ marginBottom: '1rem' }}>
            {this.state.isChunk
              ? 'A new version was deployed. Tap "Reload" to get the latest.'
              : this.state.message}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={this.hardReload}>
              Reload
            </button>
            {!this.state.isChunk && (
              <button onClick={this.reset} style={{ background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
}
