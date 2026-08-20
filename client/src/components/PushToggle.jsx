import { useState, useEffect } from 'react'
import {
  isPushSupported, isPushEnabled, enablePush, disablePush,
  getPushPrefs, setPushPrefs,
} from '../push'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'

// Settings → Notifications. The master switch plus one row per channel, since
// "notifications" is not one thing: someone who wants to know their holding
// dropped 8% may still not want a daily brief, and burying both behind a
// single toggle is how an app loses the permission entirely.
//
// The channel rows only appear once push is on — they are meaningless
// otherwise, and showing dead toggles invites people to flip them and wonder
// why nothing happens.

const MOVE_STEPS = [3, 5, 10, 20]

function Row({ label, hint, on, onToggle }) {
  return (
    <div className="settings-row settings-row-toggle">
      <div className="settings-label">
        <span>{label}</span>
        <span className="settings-hint">{hint}</span>
      </div>
      <button className={`settings-toggle ${on ? 'on' : ''}`} onClick={onToggle} aria-pressed={on}>
        <span className="settings-toggle-thumb" />
      </button>
    </div>
  )
}

export default function PushToggle() {
  const { t } = useLanguage()
  const [supported] = useState(() => isPushSupported())
  const [enabled, setEnabled] = useState(false)
  const [prefs, setPrefs] = useState(getPushPrefs)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { isPushEnabled().then(setEnabled).catch(() => {}) }, [])

  async function toggle() {
    if (busy) return
    setBusy(true); setError('')
    try {
      if (enabled) {
        await disablePush()
        setEnabled(false)
        track('push_disabled')
      } else {
        await enablePush()
        setEnabled(true)
        track('push_enabled')
      }
    } catch (e) {
      setError(e?.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  // Optimistic: the write is local-first and the server sync is best-effort,
  // so a toggle should never sit there waiting on the network to animate.
  function updatePref(patch, event) {
    setPrefs(p => ({ ...p, ...patch }))
    setPushPrefs(patch).catch(() => {})
    track(event, patch)
  }

  if (!supported) {
    return <div className="settings-hint" style={{ padding: '0.4rem 0' }}>{t('npUnsupported')}</div>
  }

  return (
    <div>
      <div className="settings-row settings-row-toggle">
        <div className="settings-label">
          <span>{t('npTitle')} {enabled && <span style={{ color: 'var(--g-ink)' }}>· {t('setPulseOn')}</span>}</span>
          <span className="settings-hint">{t('npHint')}</span>
        </div>
        <button className={`settings-toggle ${enabled ? 'on' : ''}`} onClick={toggle} disabled={busy} aria-pressed={enabled}>
          <span className="settings-toggle-thumb" />
        </button>
      </div>

      {enabled && (
        <>
          <div className="settings-divider" />

          <Row
            label={t('npMoves')}
            hint={t('npMovesHint')(prefs.movePct)}
            on={prefs.moves}
            onToggle={() => updatePref({ moves: !prefs.moves }, 'push_pref_moves')}
          />

          {prefs.moves && (
            <div className="settings-row">
              <div className="settings-label"><span>{t('npThreshold')}</span></div>
              <div className="settings-chips">
                {MOVE_STEPS.map(pct => (
                  <button key={pct}
                    className={`settings-chip ${prefs.movePct === pct ? 'active' : ''}`}
                    onClick={() => updatePref({ movePct: pct }, 'push_pref_threshold')}>
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="settings-divider" />
          <Row
            label={t('npNews')}
            hint={t('npNewsHint')}
            on={prefs.news}
            onToggle={() => updatePref({ news: !prefs.news }, 'push_pref_news')}
          />

          <div className="settings-divider" />
          <Row
            label={t('npDigest')}
            hint={t('npDigestHint')}
            on={prefs.digest}
            onToggle={() => updatePref({ digest: !prefs.digest }, 'push_pref_digest')}
          />

          <div className="settings-divider" />
          <Row
            label={t('npRetention')}
            hint={t('npRetentionHint')}
            on={prefs.retention}
            onToggle={() => updatePref({ retention: !prefs.retention }, 'push_pref_retention')}
          />

          <div className="settings-divider" />
          <Row
            label={t('npFeatures')}
            hint={t('npFeaturesHint')}
            on={prefs.features}
            onToggle={() => updatePref({ features: !prefs.features }, 'push_pref_features')}
          />

          <div className="settings-divider" />
          <Row
            label={t('npQuiet')}
            hint={t('npQuietHint')}
            on={prefs.quiet}
            onToggle={() => updatePref({ quiet: !prefs.quiet }, 'push_pref_quiet')}
          />

          <div className="settings-hint" style={{ marginTop: '0.6rem' }}>{t('npPrivacy')}</div>
        </>
      )}

      {error && <div className="settings-hint" style={{ color: '#f87171', marginTop: '0.4rem' }}>{error}</div>}
    </div>
  )
}
