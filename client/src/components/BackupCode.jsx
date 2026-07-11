import { useState, useRef, useEffect, useCallback } from 'react'
import Icon from './Icon'
import { decodeQrFromImageFile } from '../utils/qrBackup'
import { track, trackProfileCreated } from '../analytics'

import { generateBackupCode, applyBackupCode, makeQrParts } from '../backupCore'
import { EMAIL_RE, loadBackupSub, clearBackupSub, subscribeBackupEmail, resendBackupNow, daysUntilNextBackup } from '../backupSubscription'

// ── Component ─────────────────────────────────────────────────────────────

export default function BackupCode({ hideTrigger = false }) {
  const [open, setOpen] = useState(hideTrigger)
  const [mode, setMode] = useState('export')
  const [exportCode, setExportCode] = useState('')
  const [exportInfo, setExportInfo] = useState(null)
  const [copied, setCopied] = useState(false)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState('')
  const [confirmImport, setConfirmImport] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [importing, setImporting] = useState(false)
  // How the current importText was supplied — drives the analytics method tag.
  const importSourceRef = useRef('backup_code')

  // QR export
  const [showQr, setShowQr] = useState(false)
  const [qrParts, setQrParts] = useState([])

  // Weekly email-backup subscription
  const [emailAddr, setEmailAddr] = useState('')
  const [emailStatus, setEmailStatus] = useState('idle') // idle | sending | sent | error
  const [emailErr, setEmailErr] = useState('')
  const [sub, setSub] = useState(() => loadBackupSub())

  // QR scan (import)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')
  const videoRef = useRef(null)
  const scanCanvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const streamRef = useRef(null)
  const collectedPartsRef = useRef({})

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setScanning(false)
  }, [])

  // Stop camera when component unmounts or panel closes
  useEffect(() => () => stopCamera(), [stopCamera])
  useEffect(() => { if (!open) stopCamera() }, [open, stopCamera])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const { code, txCount, walletCount } = await generateBackupCode()
      setExportCode(code)
      setExportInfo({ txCount, walletCount, size: code.length })
      setCopied(false)
      setShowQr(false)
      setQrParts([])
    } finally { setGenerating(false) }
  }

  const handleShowQr = async () => {
    if (showQr) { setShowQr(false); return }
    const parts = await makeQrParts(exportCode)
    setQrParts(parts)
    setShowQr(true)
  }

  const explainMailErr = (reason) => {
    const r = String(reason || '')
    return r.includes('mail_not_configured') ? 'Email isn\'t set up on the server yet.'
      : r.includes('not verified') || r.includes('domain') ? 'The walletlens.live email domain isn\'t verified in Resend yet.'
      : r.includes('network') ? 'Couldn\'t reach the email service. Check your connection and try again.'
      : 'Couldn\'t send the backup email. Double-check your address and try again.'
  }

  // Subscribe: sends the backup now and enables the automatic weekly email.
  const subscribeBackup = async () => {
    const email = emailAddr.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) { setEmailErr('Enter a valid email address.'); return }
    setEmailErr(''); setEmailStatus('sending')
    try {
      await subscribeBackupEmail(email)
      setSub(loadBackupSub())
      setEmailStatus('sent')
      track('backup_email_subscribed')
    } catch (e) {
      setEmailErr(explainMailErr(e?.reason || (e?.message === 'Failed to fetch' ? 'network' : e?.message)))
      setEmailStatus('error')
    }
  }

  const sendBackupNow = async () => {
    setEmailErr(''); setEmailStatus('sending')
    try {
      await resendBackupNow()
      setSub(loadBackupSub())
      setEmailStatus('sent')
      track('backup_email_resent')
    } catch (e) {
      setEmailErr(explainMailErr(e?.reason || (e?.message === 'Failed to fetch' ? 'network' : e?.message)))
      setEmailStatus('error')
    }
  }

  const unsubscribeBackup = () => {
    clearBackupSub()
    setSub(null)
    setEmailStatus('idle')
    setEmailErr('')
    track('backup_email_unsubscribed')
  }

  // Ingest a scanned string — handles plain and multi-part WQ<i>/<n>: codes.
  const ingestScanned = (data) => {
    const m = /^WQ(\d+)\/(\d+):([\s\S]*)$/.exec(data)
    if (!m) return { complete: true, text: data }
    const idx = +m[1], total = +m[2], chunk = m[3]
    collectedPartsRef.current[idx] = chunk
    for (let i = 1; i <= total; i++) {
      if (collectedPartsRef.current[i] == null)
        return { complete: false, got: Object.keys(collectedPartsRef.current).length, total }
    }
    let full = ''
    for (let i = 1; i <= total; i++) full += collectedPartsRef.current[i]
    return { complete: true, text: full }
  }

  const startScan = async () => {
    setError('')
    setScanMsg('')
    collectedPartsRef.current = {}
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setScanning(true)
      // Attach stream to video after state update
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          scanFrame()
        }
      }, 80)
    } catch {
      setError('Camera access denied. Allow camera permission and try again.')
    }
  }

  const scanFrame = () => {
    const video = videoRef.current
    const canvas = scanCanvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanFrame)
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) {
      const result = ingestScanned(code.data)
      if (result.complete) {
        stopCamera()
        setScanMsg('')
        importSourceRef.current = 'qr_scan'
        setImportText(result.text)
      } else {
        setScanMsg(`Part ${result.got}/${result.total} scanned — scan the next QR code`)
        animFrameRef.current = requestAnimationFrame(scanFrame)
      }
    } else {
      animFrameRef.current = requestAnimationFrame(scanFrame)
    }
  }

  const handleCopy = async () => {
    if (!exportCode) return
    try {
      await navigator.clipboard.writeText(exportCode)
      setCopied(true); setTimeout(() => setCopied(false), 2200)
    } catch {
      const ta = document.getElementById('wl-backup-code-textarea')
      if (ta) { ta.select(); document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2200) }
    }
  }

  const handleDownload = () => {
    if (!exportCode) return
    const blob = new Blob([exportCode], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `walletlens-backup-${new Date().toISOString().slice(0,10)}.txt`
    a.click(); URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    setError(''); setImporting(true)
    try {
      const result = await applyBackupCode(importText)
      trackProfileCreated({ method: importSourceRef.current, assetCount: result?.restored, source: 'backup_import' })
      setImportResult(result); setConfirmImport(false)
      // Full navigation to the dashboard re-reads the restored localStorage and
      // lands on the overview tab (Dashboard defaults to 'overview' on load).
      setTimeout(() => { window.location.href = '/dashboard' }, 1200)
    } catch (e) {
      setError(e.message)
    } finally { setImporting(false) }
  }

  const decodeQrFromImage = (file) => {
    setError('')
    decodeQrFromImageFile(
      file,
      (data) => { importSourceRef.current = 'qr_image'; setImportText(data); setError('') },
      (err) => setError(err),
    )
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]; if (!file) { return }
    setError('')
    if (file.type.startsWith('image/')) {
      decodeQrFromImage(file)
    } else {
      const reader = new FileReader()
      reader.onload = () => setImportText(String(reader.result || ''))
      reader.readAsText(file)
    }
    // Allow selecting the same file again after an error
    e.target.value = ''
  }

  const btn = (extra) => ({
    cursor: 'pointer', border: 'none', borderRadius: '8px', fontWeight: 700,
    fontSize: '0.82rem', padding: '0.5rem 0.8rem', ...extra,
  })

  return (
    <div style={{ marginBottom: '1rem' }}>
      {!hideTrigger && (
        <button onClick={() => setOpen(o => !o)} style={{
          background: open ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.1)',
          border: '1px solid rgba(59,130,246,0.35)', borderRadius: '12px', color: '#60a5fa',
          padding: '0.55rem 0.9rem', fontWeight: 700, fontSize: '0.85rem',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
        }}>
          <BackupIcon /> Backup Code
        </button>
      )}

      {open && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(14,165,233,0.06))',
          border: '1px solid rgba(59,130,246,0.22)', borderRadius: '16px',
          padding: '1.1rem', marginTop: '0.5rem', backdropFilter: 'blur(12px)',
        }}>
          {/* Mode toggle */}
          <div style={{ display:'flex', gap:'0.4rem', marginBottom:'1rem', background:'rgba(255,255,255,0.04)', padding:'4px', borderRadius:'10px' }}>
            {['export','import'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); setImportResult(null) }} style={{
                flex:1, padding:'0.45rem', borderRadius:'8px', fontSize:'0.82rem', fontWeight:700,
                cursor:'pointer', border:'none',
                background: mode === m ? 'rgba(59,130,246,0.22)' : 'transparent',
                color: mode === m ? '#93c5fd' : 'var(--text-muted)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem',
              }}>
                {m === 'export'
                  ? <><ArrowDown /> Export</>
                  : <><ArrowUp /> Import</>}
              </button>
            ))}
          </div>

          {mode === 'export' && (
            <>
              <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', margin:'0 0 0.8rem', lineHeight:1.5 }}>
                Generates a compressed code containing all your trades, wallets and settings. Save it to restore later or move to another device.
              </p>
              {!exportCode ? (
                <button onClick={handleGenerate} disabled={generating} style={btn({
                  width:'100%', background:'linear-gradient(135deg, #3b82f6, #0ea5e9)', color:'#fff',
                  padding:'0.65rem', fontSize:'0.88rem', fontWeight:800,
                  boxShadow:'0 4px 14px rgba(59,130,246,0.35)', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem',
                })}>
                  <BackupIcon /> {generating ? 'Generating…' : 'Generate backup code'}
                </button>
              ) : (
                <>
                  <div style={{
                    background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.25)',
                    borderRadius:'8px', padding:'0.55rem 0.75rem', marginBottom:'0.6rem',
                    fontSize:'0.75rem', color:'var(--g-ink)', display:'flex', justifyContent:'space-between',
                  }}>
                    <span><Icon name="check" size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />{exportInfo?.txCount} trades · {exportInfo?.walletCount} wallets</span>
                    <span style={{ color:'var(--text-muted)' }}>{(exportInfo?.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <textarea id="wl-backup-code-textarea" value={exportCode} readOnly
                    onClick={e => e.target.select()} style={{
                      width:'100%', minHeight:'80px', background:'rgba(0,0,0,0.25)',
                      border:'1px solid rgba(59,130,246,0.25)', borderRadius:'8px', color:'var(--text)',
                      padding:'0.6rem', fontSize:'0.7rem', fontFamily:'monospace',
                      resize:'vertical', wordBreak:'break-all', boxSizing:'border-box',
                    }} />
                  <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.6rem' }}>
                    <button onClick={handleCopy} style={btn({
                      flex:1, background: copied ? 'rgba(74,222,128,0.18)' : 'rgba(59,130,246,0.18)',
                      border:`1px solid ${copied ? 'rgba(74,222,128,0.4)' : 'rgba(59,130,246,0.4)'}`,
                      color: copied ? 'var(--g-ink)' : '#93c5fd',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem',
                    })}>
                      {copied ? <><Icon name="check" size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />Copied!</> : <><CopyIcon /> Copy code</>}
                    </button>
                    <button onClick={handleDownload} style={btn({
                      background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)',
                      color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'0.4rem',
                    })}>
                      <ArrowDown /> .txt
                    </button>
                    <button onClick={handleShowQr} style={btn({
                      background: showQr ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.06)',
                      border:`1px solid ${showQr ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.12)'}`,
                      color: showQr ? '#a78bfa' : 'var(--text-muted)',
                      display:'flex', alignItems:'center', gap:'0.4rem',
                    })}>
                      <QrIcon /> QR
                    </button>
                  </div>
                  {showQr && qrParts.length > 0 && (
                    <div style={{ marginTop:'0.75rem' }}>
                      {qrParts.map(part => (
                        <div key={part.idx} style={{ textAlign:'center', marginBottom: qrParts.length > 1 ? '0.75rem' : 0 }}>
                          {qrParts.length > 1 && (
                            <p style={{ fontSize:'0.72rem', color:'#a78bfa', fontWeight:700, margin:'0 0 0.3rem' }}>
                              Part {part.idx} / {part.total}
                            </p>
                          )}
                          <img src={part.url} alt={`Backup QR${qrParts.length > 1 ? ` part ${part.idx}` : ''}`}
                            style={{ borderRadius:'8px', maxWidth:'100%', display:'block', margin:'0 auto' }} />
                        </div>
                      ))}
                      <p style={{ fontSize:'0.7rem', color:'var(--text-muted)', margin:'0.5rem 0 0', textAlign:'center' }}>
                        {qrParts.length > 1
                          ? `Scan all ${qrParts.length} QR codes in order to restore your portfolio.`
                          : 'Scan this with WalletLens on another device to restore your portfolio.'}
                      </p>
                    </div>
                  )}
                  <p style={{ fontSize:'0.7rem', color:'var(--text-muted)', margin:'0.7rem 0 0', textAlign:'center', fontStyle:'italic' }}>
                    <Icon name="lock" size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />Keep this code private — anyone with it can restore your portfolio.
                  </p>
                </>
              )}

            </>
          )}

          {mode === 'import' && (
            <>
              <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', margin:'0 0 0.8rem', lineHeight:1.5 }}>
                Paste your backup code, upload a saved <strong>QR image</strong>, or scan one with your camera to restore. This will <strong style={{ color:'#f87171' }}>overwrite</strong> your current data.
              </p>
              <textarea value={importText}
                onChange={e => { importSourceRef.current = 'backup_code'; setImportText(e.target.value); setError(''); setImportResult(null) }}
                placeholder="Paste backup code here…" style={{
                  width:'100%', minHeight:'80px', background:'rgba(0,0,0,0.25)',
                  border:'1px solid rgba(59,130,246,0.25)', borderRadius:'8px', color:'var(--text)',
                  padding:'0.6rem', fontSize:'0.72rem', fontFamily:'monospace',
                  resize:'vertical', wordBreak:'break-all', boxSizing:'border-box', marginBottom:'0.6rem',
                }} />
              <div style={{ display:'flex', gap:'0.5rem', marginBottom:'0.6rem' }}>
                <label style={{
                  flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem',
                  textAlign:'center', background:'rgba(255,255,255,0.04)',
                  border:'1px solid rgba(255,255,255,0.12)', borderRadius:'8px',
                  color:'var(--text-muted)', padding:'0.45rem', fontSize:'0.78rem',
                  cursor:'pointer', fontWeight:600,
                }}>
                  <Icon name="folder" size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />File / QR image
                  <input type="file" accept=".txt,text/plain,image/*" onChange={handleFileUpload} style={{ display:'none' }} />
                </label>
                <button onClick={scanning ? stopCamera : startScan} style={btn({
                  flex:1, background: scanning ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.04)',
                  border:`1px solid ${scanning ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.12)'}`,
                  color: scanning ? '#a78bfa' : 'var(--text-muted)',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem',
                })}>
                  <QrIcon /> {scanning ? 'Stop scan' : 'Scan QR'}
                </button>
              </div>
              {scanning && (
                <div style={{ position:'relative', borderRadius:'10px', overflow:'hidden', marginBottom:'0.6rem', background:'#000' }}>
                  <video ref={videoRef} muted playsInline style={{ width:'100%', display:'block', borderRadius:'10px' }} />
                  <canvas ref={scanCanvasRef} style={{ display:'none' }} />
                  <div style={{
                    position:'absolute', inset:0, border:'2px solid rgba(167,139,250,0.7)',
                    borderRadius:'10px', pointerEvents:'none',
                    boxShadow:'inset 0 0 0 40px rgba(0,0,0,0.35)',
                  }}>
                    <div style={{
                      position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
                      width:'55%', aspectRatio:'1', border:'2px solid #a78bfa', borderRadius:'8px',
                    }} />
                  </div>
                  <div style={{
                    position:'absolute', bottom:'0.5rem', left:0, right:0, textAlign:'center',
                    color:'#fff', fontSize:'0.72rem', fontWeight:600, textShadow:'0 1px 3px #000',
                  }}>
                    {scanMsg || 'Point camera at a WalletLens QR code'}
                  </div>
                </div>
              )}
              {scanMsg && !scanning && (
                <div style={{
                  background:'rgba(167,139,250,0.1)', border:'1px solid rgba(167,139,250,0.35)',
                  borderRadius:'8px', color:'#a78bfa', padding:'0.45rem 0.75rem',
                  fontSize:'0.75rem', marginBottom:'0.6rem', textAlign:'center', fontWeight:600,
                }}>
                  <Icon name="check" size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />{scanMsg}
                </div>
              )}
              {error && (
                <div style={{
                  background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
                  borderRadius:'8px', color:'#f87171', padding:'0.5rem 0.75rem',
                  fontSize:'0.78rem', marginBottom:'0.6rem',
                }}>
                  <Icon name="warning" size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />{error}
                </div>
              )}
              {importResult ? (
                <div style={{
                  background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.35)',
                  borderRadius:'8px', color:'var(--g-ink)', padding:'0.6rem 0.75rem',
                  fontSize:'0.85rem', textAlign:'center', fontWeight:600,
                }}>
                  <Icon name="check" size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />Restored {importResult.restored} data set{importResult.restored !== 1 ? 's' : ''}!
                  <div style={{ fontSize:'0.72rem', fontWeight:400, marginTop:'0.2rem', opacity:0.85 }}>Opening your overview…</div>
                </div>
              ) : confirmImport ? (
                <div style={{ display:'flex', gap:'0.5rem' }}>
                  <button onClick={handleImport} disabled={importing} style={btn({
                    flex:1, background:'linear-gradient(135deg, #f87171, #dc2626)', color:'#fff', padding:'0.55rem',
                  })}>
                    {importing ? 'Restoring…' : <><Icon name="warning" size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />Yes, overwrite my data</>}
                  </button>
                  <button onClick={() => setConfirmImport(false)} style={btn({
                    background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)',
                    color:'var(--text-muted)', padding:'0.55rem 0.9rem',
                  })}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => { setError(''); if (!importText.trim()) { setError('Paste a backup code first.'); return } setConfirmImport(true) }}
                  disabled={!importText.trim()} style={btn({
                    width:'100%', padding:'0.65rem', fontSize:'0.88rem', fontWeight:800,
                    background: importText.trim() ? 'linear-gradient(135deg, #3b82f6, #0ea5e9)' : 'rgba(59,130,246,0.2)',
                    color:'#fff', opacity: importText.trim() ? 1 : 0.55,
                    cursor: importText.trim() ? 'pointer' : 'not-allowed',
                    boxShadow: importText.trim() ? '0 4px 14px rgba(59,130,246,0.35)' : 'none',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem',
                  })}>
                  <ArrowUp /> Restore from code
                </button>
              )}
            </>
          )}

          {/* ── Weekly email backup subscription (always available) ── */}
          <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid rgba(255,255,255,0.09)' }}>
            <div style={{ fontSize:'0.85rem', fontWeight:800, marginBottom:'0.15rem', display:'flex', alignItems:'center', gap:'0.4rem' }}>
              <Icon name="mail" size={15} /> Weekly email backup
            </div>

            {!sub ? (
              <>
                <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', margin:'0 0 0.6rem', lineHeight:1.55 }}>
                  Register your email and WalletLens will send your backup (code + scannable QR) from <strong>noreply@walletlens.live</strong> — right now, then automatically every week when you open the app. Delivered on demand; no copy is kept on our servers.
                </p>
                <div style={{ display:'flex', gap:'0.5rem' }}>
                  <input
                    type="email" inputMode="email" autoComplete="email"
                    value={emailAddr}
                    onChange={e => { setEmailAddr(e.target.value); if (emailErr) setEmailErr(''); if (emailStatus !== 'idle') setEmailStatus('idle') }}
                    placeholder="you@example.com"
                    style={{
                      flex:1, minWidth:0, background:'rgba(0,0,0,0.25)',
                      border:'1px solid rgba(59,130,246,0.25)', borderRadius:'8px', color:'var(--text)',
                      padding:'0.55rem 0.7rem', fontSize:'0.8rem', boxSizing:'border-box',
                    }} />
                  <button onClick={subscribeBackup} disabled={emailStatus === 'sending'} style={btn({
                    background:'linear-gradient(135deg, #047857, #10b981)', border:'none', color:'#fff',
                    fontWeight:700, opacity: emailStatus === 'sending' ? 0.7 : 1, whiteSpace:'nowrap',
                    display:'inline-flex', alignItems:'center', gap:'0.35rem',
                  })}>
                    {emailStatus === 'sending' ? 'Sending…' : <><Icon name="mail" size={14} /> Subscribe</>}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap',
                  background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.25)',
                  borderRadius:'10px', padding:'0.55rem 0.75rem', margin:'0.15rem 0 0.6rem',
                  fontSize:'0.75rem', color:'var(--g-ink)', fontWeight:600,
                }}>
                  <Icon name="check" size={14} />
                  <span style={{ wordBreak:'break-all' }}>Weekly backup on · {sub.email}</span>
                  {daysUntilNextBackup() != null && (
                    <span style={{ color:'var(--text-muted)', fontWeight:500, marginLeft:'auto' }}>
                      next in ~{daysUntilNextBackup()}d
                    </span>
                  )}
                </div>
                <div style={{ display:'flex', gap:'0.5rem' }}>
                  <button onClick={sendBackupNow} disabled={emailStatus === 'sending'} style={btn({
                    flex:1, background:'rgba(59,130,246,0.18)', border:'1px solid rgba(59,130,246,0.4)',
                    color:'#93c5fd', fontWeight:700, opacity: emailStatus === 'sending' ? 0.7 : 1,
                    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'0.35rem',
                  })}>
                    {emailStatus === 'sending' ? 'Sending…' : <><Icon name="mail" size={13} /> Send now</>}
                  </button>
                  <button onClick={unsubscribeBackup} style={btn({
                    background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.3)',
                    color:'#f87171', fontWeight:700, whiteSpace:'nowrap',
                  })}>Unsubscribe</button>
                </div>
              </>
            )}

            {emailStatus === 'sent' && (
              <p style={{ fontSize:'0.72rem', color:'var(--g-ink)', margin:'0.5rem 0 0', fontWeight:600 }}>
                <Icon name="check" size={13} style={{ verticalAlign:'-2px', marginRight:'0.3em' }} />Sent — check your inbox (and spam folder).
              </p>
            )}
            {emailErr && (
              <p style={{ fontSize:'0.72rem', color:'#f87171', margin:'0.5rem 0 0' }}>{emailErr}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────

function BackupIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z"/>
    </svg>
  )
}
function ArrowDown() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
}
function ArrowUp() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
}
function CopyIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
}
function QrIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M14 14h2v2h-2zM18 14h3v3h-3zM14 18h3v3h-3zM18 20h3v1h-3z"/>
    </svg>
  )
}
