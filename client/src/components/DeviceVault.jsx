import { useState, useEffect, useCallback } from 'react'
import { saveVault, lastVaultSave, requestVaultRestore, looksEmpty } from '../nativeVault'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'

// Settings → the copy of the portfolio held inside the Android app.
//
// The panel exists because the situation it describes is genuinely surprising:
// WalletLens is a Trusted Web Activity, so the app IS Chrome, and everything
// the portfolio consists of lives in Chrome's storage for this origin. Clearing
// the browser's data therefore empties the app, while the app's own "Clear
// storage" does nothing at all. Neither is guessable, and the first time anyone
// finds out is when their portfolio is gone.
//
// So: a copy in the app's own directory, a line saying when it was last taken,
// and — only when this device has actually lost everything — an offer to put it
// back. See nativeVault.js for why this is a mirror rather than a move.

function since(ts, t) {
  if (!ts) return t('dvNever')
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return t('dvJustNow')
  if (mins < 60) return t('dvMinutesAgo')(mins)
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('dvHoursAgo')(hours)
  return t('dvDaysAgo')(Math.floor(hours / 24))
}

export default function DeviceVault() {
  const { t } = useLanguage()
  const [last, setLast] = useState(() => lastVaultSave())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  // Read once on mount rather than on every render: the answer cannot change
  // while this screen is open without the user leaving it first.
  const [empty] = useState(() => looksEmpty())

  useEffect(() => { setLast(lastVaultSave()) }, [])

  const copyNow = useCallback(async () => {
    setBusy(true)
    setNote('')
    try {
      const out = await saveVault()
      if (out.ok) {
        setLast(lastVaultSave())
        setNote(t('dvSaved'))
        track('vault_save', { source: 'settings' })
      } else {
        // Named rather than a generic failure. "too-large" and "no gesture"
        // want completely different things from the user, and a single
        // "couldn't save" tells them neither.
        setNote(out.reason === 'too-large' ? t('dvTooLarge') : t('dvSaveFailed'))
      }
    } finally {
      setBusy(false)
    }
  }, [t])

  return (
    <div className="settings-section glass-card">
      <h3 className="settings-section-title">{t('dvTitle')}</h3>

      <div className="settings-row settings-row-toggle">
        <div className="settings-label">
          <span>{t('dvCopy')}</span>
          <span className="settings-hint">{t('dvCopyHint')}</span>
          <span className="settings-hint">{t('dvLast')(since(last, t))}</span>
        </div>
        <button className="settings-chip" onClick={copyNow} disabled={busy}>
          {busy ? t('dvSaving') : t('dvCopyNow')}
        </button>
      </div>

      {/* Offered only to a device that has actually lost everything. An
          invitation to overwrite a portfolio someone is halfway through
          building is the one prompt this panel must never show. */}
      {empty && (
        <>
          <div className="settings-divider" />
          <div className="settings-row settings-row-toggle">
            <div className="settings-label">
              <span>{t('dvRestore')}</span>
              <span className="settings-hint">{t('dvRestoreHint')}</span>
            </div>
            <button
              className="settings-chip"
              onClick={() => { track('vault_restore', { source: 'settings' }); requestVaultRestore() }}
            >
              {t('dvRestoreNow')}
            </button>
          </div>
        </>
      )}

      {note && <div className="settings-hint" style={{ marginTop: '0.5rem' }}>{note}</div>}

      <div className="settings-hint" style={{ marginTop: '0.6rem' }}>{t('dvWhy')}</div>
    </div>
  )
}
