import { useState, lazy, Suspense } from 'react'
import { useLanguage } from '../LanguageContext'
import { api } from '../api'
import { noteFeatureUse } from '../featureUse'
import { track, trackImport, importCompleted } from '../analytics'
import { driveState, previouslyConnected, latestBackupAt } from '../driveSync'
import { noteMoment } from '../reviewPrompt'

// Backup & restore, on a page of its own: Google Drive first (automatic), then
// the backup code, the QR code for another phone, and restoring from a code.
// The same api calls as the Dashboard's DataPanel, laid out as Settings cards.

const DriveBackup = lazy(() => import('../components/DriveBackup'))
let _qr = null
const loadQr = () => (_qr ||= import('../utils/qrBackup'))

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
const IC = {
  drive: <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 6h14l14 24H31z" fill="#ffba00"/><path d="M17 6 3 30l7 12 14-24z" fill="#00a85d"/><path d="M10 42h28l7-12H17z" fill="#2684fc"/></svg>,
  code: <svg viewBox="0 0 24 24" {...P}><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h2M11 10h2M15 10h2M7 14h10"/></svg>,
  qr: <svg viewBox="0 0 24 24" {...P}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3M21 14v.01M14 21h3M20 17v4"/></svg>,
  restore: <svg viewBox="0 0 24 24" {...P}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4l3 2"/></svg>,
  copy: <svg viewBox="0 0 24 24" {...P}><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>,
  check: <svg viewBox="0 0 24 24" {...P}><path d="M5 12l5 5 9-10"/></svg>,
  shield: <svg viewBox="0 0 24 24" {...P}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>,
}

function Card({ icon, color, title, hint, badge, children }) {
  return (
    <section className="bk-card">
      <div className="bk-head">
        <span className="sx-ic" style={{ background: color }} aria-hidden="true">{icon}</span>
        <span className="sx-lb"><b>{title}</b>{hint && <small>{hint}</small>}</span>
        {badge}
      </div>
      {children && <div className="bk-body">{children}</div>}
    </section>
  )
}

export default function BackupView({ onBack, relTime }) {
  const { t, lang } = useLanguage()
  const [drive] = useState(() => driveState())
  const backedAt = previouslyConnected(drive) ? latestBackupAt(drive) : 0

  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [qrParts, setQrParts] = useState([])
  const [showQr, setShowQr] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [paste, setPaste] = useState('')
  const [preview, setPreview] = useState(null)
  const [done, setDone] = useState(false)

  async function makeCode() {
    setBusy('code'); setMsg('')
    try {
      try { localStorage.setItem('wl_exported_at', String(Date.now())) } catch { /* private mode */ }
      noteFeatureUse('exportdata')
      const result = await api.exportCode().catch(() => null)
      if (result) { setCode(result); track('backup_code_made', { source: 'settings' }); noteMoment('backup_saved') }
      else setMsg(t('errExportFailed'))
    } finally { setBusy('') }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { setMsg(t('errCopyFailed')) }
  }

  async function makeQr() {
    if (showQr) { setShowQr(false); return }
    if (qrParts.length) { setShowQr(true); return }
    setBusy('qr'); setMsg('')
    try {
      const { makeQrParts } = await loadQr()
      const url = await api.exportQrDeepLink().catch(() => null)
      const parts = url ? await makeQrParts(url) : []
      setQrParts(parts); setShowQr(parts.length > 0)
      if (!parts.length) setMsg(t('errQrFailed'))
      else { track('backup_qr_made', { source: 'settings', parts: parts.length }); noteMoment('backup_saved') }
    } finally { setBusy('') }
  }

  async function check() {
    if (!paste.trim()) return
    setBusy('check')
    const result = await api.previewImportCode(paste.trim())
    setBusy('')
    if (!result.success) { setMsg(t('errInvalidCodePrefix') + result.error); setPreview(null); return }
    setPreview(result); setMsg('')
  }

  async function restore() {
    if (!preview) return
    setBusy('restore')
    const result = await api.importCode(paste.trim())
    setBusy('')
    if (result?.success === false) { setMsg(t('errImportFailedPrefix') + (result.error || 'unknown error')); return }
    trackImport({ method: 'backup', step: 'saved' })
    importCompleted({ method: 'backup' })
    noteMoment('import_success')
    setPaste(''); setPreview(null); setDone(true)
    setTimeout(() => { window.location.href = '/dashboard' }, 900)
  }

  return (
    <div className="sx bk">
      <div className="sx-top">
        <button className="sx-back" onClick={onBack} aria-label={t('back')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h1 className="sx-title" style={{ margin: 0 }}>{t('sxBackup')}</h1>
      </div>

      <div className={`bk-status${backedAt ? ' ok' : ''}`}>
        <span className="bk-status-ic">{IC.shield}</span>
        <div>
          <b>{backedAt ? t('sxBackedUp')(relTime(backedAt, lang)) : t('sxNoBackup')}</b>
          <small>{t('bkStatusHint')}</small>
        </div>
      </div>

      {drive.configured && (
        <>
          <h3 className="sx-gt">{t('bkAuto')}</h3>
          <section className="bk-card bk-drive">
            <div className="bk-head">
              <span className="sx-ic bk-drive-ic" aria-hidden="true">{IC.drive}</span>
              <span className="sx-lb"><b>Google Drive</b><small>{t('bkDriveHint')}</small></span>
              <span className="bk-pill">{t('bkRecommended')}</span>
            </div>
            <div className="bk-body bk-drive-body">
              <Suspense fallback={null}><DriveBackup embedded /></Suspense>
            </div>
          </section>
        </>
      )}

      <h3 className="sx-gt">{t('bkManual')}</h3>
      <div className="bk-pair">
        <Card icon={IC.code} color="#6366f1" title={t('bkCodeT')} hint={t('bkCodeHint')}>
          {code ? (
            <>
              <div className="bk-code">{code}</div>
              <button className="bk-btn" onClick={copy}>{copied ? <>{IC.check} {t('bkCopied')}</> : <>{IC.copy} {t('bkCopy')}</>}</button>
            </>
          ) : (
            <button className="bk-btn bk-pri" onClick={makeCode} disabled={!!busy}>{busy === 'code' ? '…' : t('bkMakeCode')}</button>
          )}
        </Card>

        <Card icon={IC.qr} color="#0ea5e9" title={t('bkQrT')} hint={t('bkQrHint')}>
          <button className="bk-btn" onClick={makeQr} disabled={!!busy}>{busy === 'qr' ? '…' : showQr ? t('bkHideQr') : t('bkShowQr')}</button>
          {showQr && qrParts.length > 0 && (
            <div className="bk-qrs">
              {qrParts.length > 1 && <p className="bk-note">{t('bkQrParts')}</p>}
              {qrParts.map(part => (
                <figure key={part.idx} className="bk-qr">
                  <img src={part.url} alt={`QR ${part.idx}/${part.total}`} />
                  {part.total > 1 && <figcaption>{part.idx} / {part.total}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ height: 6 }} />
      <Card icon={IC.restore} color="#f97316" title={t('bkRestoreT')} hint={t('bkRestoreHint')}>
        <textarea className="bk-paste" rows={3} placeholder={t('phPasteWlz')} value={paste}
          onChange={e => { setPaste(e.target.value); setPreview(null); setMsg('') }} />
        {preview && (
          <div className="bk-preview">
            <div><span>{t('wallets')}</span><b>{preview.summary.wallets}</b></div>
            <div><span>{t('transactions')}</span><b>{preview.summary.transactions}</b></div>
          </div>
        )}
        {preview
          ? <button className="bk-btn bk-pri" onClick={restore} disabled={!!busy}>{busy === 'restore' ? '…' : t('bkRestoreNow')}</button>
          : <button className="bk-btn" onClick={check} disabled={!!busy || !paste.trim()}>{busy === 'check' ? '…' : t('bkCheck')}</button>}
        {done && <p className="bk-note bk-ok">{IC.check} {t('bkRestored')}</p>}
      </Card>

      {msg && <p className="bk-msg" role="alert">{msg}</p>}
    </div>
  )
}
