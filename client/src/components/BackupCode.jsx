import { useState, useRef, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'
import jsQR from 'jsqr'

const BACKUP_KEYS = [
  'crypto_tracker_transactions',
  'crypto_tracker_wallets',
  'crypto_tracker_coin_targets',
  'crypto_tracker_exchanges',
  'crypto_tracker_coin_notes',
  'crypto_tracker_manual_prices',
  'crypto_tracker_next_tx_id',
  'crypto_tracker_next_wallet_id',
  'crypto_tracker_next_ex_id',
  'wl_settings',
  'wl_card_vis',
]

// ── Compression helpers (WL2 format) ──────────────────────────────────────

async function gzipB64(str) {
  if (!window.CompressionStream) return null
  const bytes = new TextEncoder().encode(str)
  const cs = new CompressionStream('gzip')
  const w = cs.writable.getWriter(); w.write(bytes); w.close()
  const chunks = []; const r = cs.readable.getReader()
  while (true) { const { done, value } = await r.read(); if (done) break; chunks.push(value) }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let off = 0; for (const c of chunks) { out.set(c, off); off += c.length }
  let s = ''; out.forEach(b => s += String.fromCharCode(b))
  return btoa(s)
}

async function gunzipB64(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const ds = new DecompressionStream('gzip')
  const w = ds.writable.getWriter(); w.write(bytes); w.close()
  const chunks = []; const r = ds.readable.getReader()
  while (true) { const { done, value } = await r.read(); if (done) break; chunks.push(value) }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let off = 0; for (const c of chunks) { out.set(c, off); off += c.length }
  return new TextDecoder().decode(out)
}

// ── utf8-safe base64 fallback (WL1 format) ────────────────────────────────

function b64encode(str) { return btoa(unescape(encodeURIComponent(str))) }
function b64decode(str) { return decodeURIComponent(escape(atob(str))) }

// ── Core logic ────────────────────────────────────────────────────────────

async function generateBackupCode() {
  const data = {}; let nonEmpty = 0
  for (const key of BACKUP_KEYS) {
    const val = localStorage.getItem(key)
    if (val != null) { data[key] = val; nonEmpty++ }
  }
  const json = JSON.stringify({ v: 2, ts: Date.now(), data })
  const compressed = await gzipB64(json)
  const code = compressed ? `WL2-${compressed}` : `WL1-${b64encode(json)}`
  return { code, keyCount: nonEmpty }
}

async function applyBackupCode(raw) {
  const code = (raw || '').trim().replace(/\s+/g, '')
  if (!code) throw new Error('Paste a backup code first.')

  let json
  if (code.startsWith('WL2-')) {
    try { json = await gunzipB64(code.slice(4)) }
    catch { throw new Error('Could not decompress backup code — make sure you copied it completely.') }
  } else {
    // Accept WL1- prefix OR raw base64 (prefix may have been lost when copying)
    const b64 = code.startsWith('WL1-') ? code.slice(4) : code
    try { json = b64decode(b64) }
    catch { throw new Error('Could not decode backup code — make sure you copied it completely.') }
  }

  let parsed
  try { parsed = JSON.parse(json) } catch { throw new Error('Backup data is corrupted or incomplete.') }
  if (!parsed?.data || typeof parsed.data !== 'object') throw new Error('Backup data is missing or corrupted.')

  let restored = 0
  for (const [key, val] of Object.entries(parsed.data)) {
    if (BACKUP_KEYS.includes(key) && typeof val === 'string') {
      localStorage.setItem(key, val); restored++
    }
  }
  return { restored, when: parsed.ts ? new Date(parsed.ts) : null }
}

function getStats() {
  try {
    const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions') || '[]')
    const wallets = JSON.parse(localStorage.getItem('crypto_tracker_wallets') || '[]')
    return { txCount: txs.length, walletCount: wallets.length }
  } catch { return { txCount: 0, walletCount: 0 } }
}

// ── Component ─────────────────────────────────────────────────────────────

// QR code size limit: ~2900 bytes fits in a version-40 QR code at low error correction
const QR_MAX_BYTES = 2900

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

  // QR export
  const [showQr, setShowQr] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const qrCanvasRef = useRef(null)

  // QR scan (import)
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef(null)
  const scanCanvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const streamRef = useRef(null)

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
      const { code, keyCount } = await generateBackupCode()
      setExportCode(code)
      setExportInfo({ ...getStats(), keyCount, size: code.length })
      setCopied(false)
      setShowQr(false)
      setQrDataUrl('')
    } finally { setGenerating(false) }
  }

  const handleShowQr = async () => {
    if (showQr) { setShowQr(false); return }
    try {
      const url = await QRCode.toDataURL(exportCode, {
        errorCorrectionLevel: 'L', margin: 1, width: 260,
        color: { dark: '#000000', light: '#ffffff' },
      })
      setQrDataUrl(url)
      setShowQr(true)
    } catch { /* code too large — QR_MAX_BYTES check handles messaging */ }
  }

  const startScan = async () => {
    setError('')
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
      stopCamera()
      setImportText(code.data)
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
      setImportResult(result); setConfirmImport(false)
      // Full navigation to the dashboard re-reads the restored localStorage and
      // lands on the overview tab (Dashboard defaults to 'overview' on load).
      setTimeout(() => { window.location.href = '/dashboard' }, 1200)
    } catch (e) {
      setError(e.message)
    } finally { setImporting(false) }
  }

  const decodeQrFromImageFile = (file) => {
    setError('')
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        // Cap dimensions so very large photos don't blow up memory, but keep
        // enough resolution for jsQR to find the finder patterns.
        const maxDim = 1600
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
        canvas.width = Math.round(img.naturalWidth * scale)
        canvas.height = Math.round(img.naturalHeight * scale)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)
        if (code?.data) { setImportText(code.data); setError('') }
        else { setError('No QR code found in that image. Try a clearer, more cropped image — or paste the backup code instead.') }
      } catch {
        setError('Could not read that image. Try pasting the backup code instead.')
      } finally { URL.revokeObjectURL(url) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); setError('Could not open that image file.') }
    img.src = url
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]; if (!file) { return }
    setError('')
    if (file.type.startsWith('image/')) {
      decodeQrFromImageFile(file)
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
                    fontSize:'0.75rem', color:'#4ade80', display:'flex', justifyContent:'space-between',
                  }}>
                    <span>✅ {exportInfo?.txCount} trades · {exportInfo?.walletCount} wallets</span>
                    <span style={{ color:'var(--text-muted)' }}>{(exportInfo?.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <textarea id="wl-backup-code-textarea" value={exportCode} readOnly
                    onClick={e => e.target.select()} style={{
                      width:'100%', minHeight:'80px', background:'rgba(0,0,0,0.25)',
                      border:'1px solid rgba(59,130,246,0.25)', borderRadius:'8px', color:'#e2e8f0',
                      padding:'0.6rem', fontSize:'0.7rem', fontFamily:'monospace',
                      resize:'vertical', wordBreak:'break-all', boxSizing:'border-box',
                    }} />
                  <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.6rem' }}>
                    <button onClick={handleCopy} style={btn({
                      flex:1, background: copied ? 'rgba(74,222,128,0.18)' : 'rgba(59,130,246,0.18)',
                      border:`1px solid ${copied ? 'rgba(74,222,128,0.4)' : 'rgba(59,130,246,0.4)'}`,
                      color: copied ? '#4ade80' : '#93c5fd',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem',
                    })}>
                      {copied ? '✅ Copied!' : <><CopyIcon /> Copy code</>}
                    </button>
                    <button onClick={handleDownload} style={btn({
                      background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)',
                      color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'0.4rem',
                    })}>
                      <ArrowDown /> .txt
                    </button>
                    {exportCode.length <= QR_MAX_BYTES && (
                      <button onClick={handleShowQr} style={btn({
                        background: showQr ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.06)',
                        border:`1px solid ${showQr ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.12)'}`,
                        color: showQr ? '#a78bfa' : 'var(--text-muted)',
                        display:'flex', alignItems:'center', gap:'0.4rem',
                      })}>
                        <QrIcon /> QR
                      </button>
                    )}
                  </div>
                  {exportCode.length > QR_MAX_BYTES && (
                    <p style={{ fontSize:'0.7rem', color:'rgba(251,191,36,0.8)', margin:'0.5rem 0 0', lineHeight:1.5 }}>
                      ⚠️ Portfolio too large for a QR code ({(exportCode.length/1024).toFixed(1)} KB). Use copy or .txt instead.
                    </p>
                  )}
                  {showQr && qrDataUrl && (
                    <div style={{ textAlign:'center', marginTop:'0.75rem' }}>
                      <img src={qrDataUrl} alt="Backup QR code" style={{ borderRadius:'8px', maxWidth:'100%', display:'block', margin:'0 auto' }} />
                      <p style={{ fontSize:'0.7rem', color:'var(--text-muted)', margin:'0.5rem 0 0' }}>
                        Scan this with WalletLens on another device to restore your portfolio.
                      </p>
                    </div>
                  )}
                  <p style={{ fontSize:'0.7rem', color:'var(--text-muted)', margin:'0.7rem 0 0', textAlign:'center', fontStyle:'italic' }}>
                    🔒 Keep this code private — anyone with it can restore your portfolio.
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
                onChange={e => { setImportText(e.target.value); setError(''); setImportResult(null) }}
                placeholder="Paste backup code here…" style={{
                  width:'100%', minHeight:'80px', background:'rgba(0,0,0,0.25)',
                  border:'1px solid rgba(59,130,246,0.25)', borderRadius:'8px', color:'#e2e8f0',
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
                  📂 File / QR image
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
                    Point camera at a WalletLens QR code
                  </div>
                </div>
              )}
              {error && (
                <div style={{
                  background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
                  borderRadius:'8px', color:'#f87171', padding:'0.5rem 0.75rem',
                  fontSize:'0.78rem', marginBottom:'0.6rem',
                }}>
                  ⚠️ {error}
                </div>
              )}
              {importResult ? (
                <div style={{
                  background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.35)',
                  borderRadius:'8px', color:'#4ade80', padding:'0.6rem 0.75rem',
                  fontSize:'0.85rem', textAlign:'center', fontWeight:600,
                }}>
                  ✅ Restored {importResult.restored} data set{importResult.restored !== 1 ? 's' : ''}!
                  <div style={{ fontSize:'0.72rem', fontWeight:400, marginTop:'0.2rem', opacity:0.85 }}>Opening your overview…</div>
                </div>
              ) : confirmImport ? (
                <div style={{ display:'flex', gap:'0.5rem' }}>
                  <button onClick={handleImport} disabled={importing} style={btn({
                    flex:1, background:'linear-gradient(135deg, #f87171, #dc2626)', color:'#fff', padding:'0.55rem',
                  })}>
                    {importing ? 'Restoring…' : '⚠️ Yes, overwrite my data'}
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
