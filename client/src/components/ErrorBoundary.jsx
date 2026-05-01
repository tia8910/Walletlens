import { Component } from 'react'

// Catches render-time errors anywhere in the wrapped subtree so a bug
// on one page doesn't blank the whole app. Logs to console in dev,
// silently shows a recovery card in prod.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message || 'Unexpected error' }
  }

  componentDidCatch(err, info) {
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary]', err, info?.componentStack)
    }
  }

  reset = () => this.setState({ hasError: false, message: '' })

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="page" role="alert">
        <div className="card">
          <h3 style={{ marginBottom: '0.5rem' }}>Something broke on this page</h3>
          <p className="muted" style={{ marginBottom: '1rem' }}>
            {this.state.message}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={this.reset}>Try again</button>
            <button onClick={() => window.location.reload()} style={{ background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)' }}>
              Reload app
            </button>
          </div>
        </div>
      </div>
    )
  }
}
