import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { completeRedirectSignIn } from '../googleDrive'
import { useLanguage } from '../LanguageContext'

// Landing point for the Google OAuth redirect flow.
//
// In the authorization code flow, Google sends the browser back here with
// ?code=...&state=... in the query string.  The old implicit grant sent
// #access_token=... in the fragment — we still handle that as a fallback
// for any sessions that were mid-flight during the upgrade.
//
// The code/query must never reach any server except the Drive token worker,
// and must never sit in browser history — hence the immediate
// replaceState before anything else happens.

export default function DriveCallback() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLanguage()
  const [error, setError] = useState(null)

  useEffect(() => {
    // Scrub immediately: even a failed sign-in should not leave tokens
    // or authorization codes in the address bar or history.
    try { window.history.replaceState(null, '', window.location.pathname) } catch { /* fine */ }

    // The authorization code arrives as a query parameter (?code=...&state=...)
    // or, in the legacy implicit grant path, as a hash fragment (#access_token=...).
    const search = location.search
    const hash = window.location.hash

    // Check for error first (Google redirects with ?error=access_denied etc.)
    const errParams = new URLSearchParams(search || hash || '')
    const err = errParams.get('error')
    if (err) {
      setError(err === 'access_denied' ? 'Sign-in was cancelled' : `Google sign-in failed: ${err}`)
      return
    }

    // New auth code flow: ?code=...&state=...
    if (search && search.includes('code=')) {
      const params = new URLSearchParams(search)
      const code = params.get('code')
      if (code) {
        completeRedirectSignInWithCode(code, navigate, setError, t('dcFailed'))
        return
      }
    }

    // Legacy implicit grant fallback: #access_token=...
    if (hash && hash.includes('access_token=')) {
      completeRedirectSignIn(hash).then(({ returnTo }) => {
        navigate(returnTo || '/settings', { replace: true, state: { driveConnected: true } })
      }).catch(() => setError(t('dcFailed')))
      return
    }

    setError(t('dcNoAuth'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
      {error ? (
        <>
          <h2 style={{ marginBottom: '0.75rem' }}>Google Drive</h2>
          <p style={{ opacity: 0.75, marginBottom: '1.5rem' }}>{error}</p>
          <button className="settings-chip" onClick={() => navigate('/settings', { replace: true })}>
            {t('dcBack')}
          </button>
        </>
      ) : (
        <p style={{ opacity: 0.75 }}>Connecting your Google Drive…</p>
      )}
    </div>
  )
}

// The failure message is passed in already translated. It is not derived from
// `e.message`: that string comes from Google or from a fetch failure, is always
// English, and says things like "invalid_grant" that tell the person nothing
// about what to do next. The error is still worth logging, just not showing.
async function completeRedirectSignInWithCode(code, navigate, setError, failedMsg) {
  try {
    const { returnTo } = await completeRedirectSignIn(code)
    navigate(returnTo || '/settings', { replace: true, state: { driveConnected: true } })
  } catch (e) {
    console.warn('drive sign-in failed:', String(e?.message || e).slice(0, 200))
    setError(failedMsg)
  }
}
