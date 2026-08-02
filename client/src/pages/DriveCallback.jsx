import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { completeRedirectSignIn } from '../googleDrive'

// Landing point for the Google OAuth redirect flow. Google sends the browser
// back here with the access token in the URL fragment. This page's whole job
// is to get that token out of the URL and out of history as fast as possible,
// then put the user back where they started.
//
// The fragment never reaches any server (fragments aren't sent in requests),
// but it WOULD sit in browser history if left alone — hence the immediate
// replaceState before anything else happens.

export default function DriveCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    const hash = window.location.hash
    // Scrub first, validate second: even a failed sign-in should not leave
    // token-shaped strings in the history.
    try { window.history.replaceState(null, '', window.location.pathname) } catch { /* fine */ }
    try {
      const { returnTo } = completeRedirectSignIn(hash)
      navigate(returnTo || '/settings', { replace: true, state: { driveConnected: true } })
    } catch (e) {
      setError(e.message || 'Sign-in failed')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
      {error ? (
        <>
          <h2 style={{ marginBottom: '0.75rem' }}>Google Drive</h2>
          <p style={{ opacity: 0.75, marginBottom: '1.5rem' }}>{error}</p>
          <button className="settings-chip" onClick={() => navigate('/settings', { replace: true })}>
            Back to Settings
          </button>
        </>
      ) : (
        <p style={{ opacity: 0.75 }}>Connecting your Google Drive…</p>
      )}
    </div>
  )
}
