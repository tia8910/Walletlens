import { useState } from 'react'

// All localStorage keys that should round-trip through a backup
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

// utf8-safe base64 (handles Arabic, emoji, etc.)
function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)))
}
function b64decode(str) {
  return decodeURIComponent(escape(atob(str)))
}

function generateBackupCode() {
  const data = {}
  let nonEmpty = 0
  for (const key of BACKUP_KEYS) {
    const val = localStorage.getItem(key)
    if (val != null) { data[key] = val; nonEmpty++ }
  }
  const payload = { v: 1, ts: Date.now(), data }
  const json = JSON.stringify(payload)
  return { code: `WL1-${b64encode(json)}`, keyCount: nonEmpty }
}

function applyBackupCode(code) {
  const trimmed = (code || '').trim().replace(/\s+/g, '')
  if (!trimmed.startsWith('WL1-')) throw new Error('Invalid backup code (must start with "WL1-")')
  const encoded = trimmed.slice(4)
  let parsed
  try {
    parsed = JSON.parse(b64decode(encoded))
  } catch {
    throw new Error('Could not decode backup code — make sure you copied it completely.')
  }
  if (!parsed?.data || typeof parsed.data !== 'object') throw new Error('Backup data is missing or corrupted.')

  let restored = 0
  for (const [key, val] of Object.entries(parsed.data)) {
    if (BACKUP_KEYS.includes(key) && typeof val === 'string') {
      localStorage.setItem(key, val)
      restored++
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

export default function BackupCode({ hideTrigger = false, onClose }) {
  const [open, setOpen] = useState(hideTrigger)
  const [mode, setMode] = useState('export') // 'export' | 'import'
  const [exportCode, setExportCode] = useState('')
  const [exportInfo, setExportInfo] = useState(null)
  const [copied, setCopied] = useState(false)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState('')
  const [confirmImport, setConfirmImport] = useState(false)

  const handleGenerate = () => {
    const { code, keyCount } = generateBackupCode()
    setExportCode(code)
    setExportInfo({ ...getStats(), keyCount, size: code.length })
    setCopied(false)
  }

  const handleCopy = async () => {
    if (!exportCode) return
    try {
      await navigator.clipboard.writeText(exportCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      // Fallback: select text
      const ta = document.getElementById('wl-backup-code-textarea')
      if (ta) { ta.select(); document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2200) }
    }
  }

  const handleDownload = () => {
    if (!exportCode) return
    const blob = new Blob([exportCode], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `walletlens-backup-${new Date().toISOString().slice(0,10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    setError('')
    try {
      const result = applyBackupCode(importText)
      setImportResult(result)
      setConfirmImport(false)
      // Reload after a moment so all components pick up the new data
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImportText(String(reader.result || ''))
    reader.readAsText(file)
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      {!hideTrigger && (
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            background: open ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.1)',
            border: '1px solid rgba(59,130,246,0.35)',
            borderRadius: '12px', color: '#60a5fa',
            padding: '0.55rem 0.9rem', fontWeight: 700, fontSize: '0.85rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            gap: '0.5rem', width: '100%', justifyContent: 'space-between',
          }}
        >
          <span style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <BackupIcon />
            Backup Code
          </span>
        </button>
      )}

      {open && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(14,165,233,0.06))',
          border: '1px solid rgba(59,130,246,0.22)',
          borderRadius: '16px', padding: '1.1rem', marginTop: '0.5rem',
          backdropFilter: 'blur(12px)',
        }}>
          {/* Mode toggle */}
          <div style={{ display:'flex', gap:'0.4rem', marginBottom:'1rem', background:'rgba(255,255,255,0.04)', padding:'4px', borderRadius:'10px' }}>
            <button onClick={() => { setMode('export'); setError(''); setImportResult(null) }} style={{
              flex:1, padding:'0.45rem', borderRadius:'8px', fontSize:'0.82rem', fontWeight:700,
              cursor:'pointer', border:'none',
              background: mode === 'export' ? 'rgba(59,130,246,0.22)' : 'transparent',
              color: mode === 'export' ? '#93c5fd' : 'var(--text-muted)',
              display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export
            </button>
            <button onClick={() => { setMode('import'); setError('') }} style={{
              flex:1, padding:'0.45rem', borderRadius:'8px', fontSize:'0.82rem', fontWeight:700,
              cursor:'pointer', border:'none',
              background: mode === 'import' ? 'rgba(59,130,246,0.22)' : 'transparent',
              color: mode === 'import' ? '#93c5fd' : 'var(--text-muted)',
              display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Import
            </button>
          </div>

          {mode === 'export' && (
            <>
              <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', margin:'0 0 0.8rem', lineHeight:1.5 }}>
                Generate a single code containing all your trades, wallets, targets, and settings. Save it somewhere safe to restore later or move to another device.
              </p>
              {!exportCode ? (
                <button onClick={handleGenerate} style={{
                  width:'100%',
                  background:'linear-gradient(135deg, #3b82f6, #0ea5e9)',
                  border:'none', borderRadius:'10px', color:'#fff',
                  padding:'0.65rem', fontWeight:800, fontSize:'0.88rem', cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem',
                  boxShadow:'0 4px 14px rgba(59,130,246,0.35)',
                }}>
                  <BackupIcon /> Generate backup code
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
                  <textarea
                    id="wl-backup-code-textarea"
                    value={exportCode}
                    readOnly
                    onClick={(e) => e.target.select()}
                    style={{
                      width:'100%', minHeight:'90px',
                      background:'rgba(0,0,0,0.25)', border:'1px solid rgba(59,130,246,0.25)',
                      borderRadius:'8px', color:'#e2e8f0',
                      padding:'0.6rem', fontSize:'0.7rem',
                      fontFamily:'monospace', resize:'vertical', wordBreak:'break-all',
                      boxSizing:'border-box',
                    }}
                  />
                  <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.6rem' }}>
                    <button onClick={handleCopy} style={{
                      flex:1, background: copied ? 'rgba(74,222,128,0.18)' : 'rgba(59,130,246,0.18)',
                      border:`1px solid ${copied ? 'rgba(74,222,128,0.4)' : 'rgba(59,130,246,0.4)'}`,
                      borderRadius:'8px', color: copied ? '#4ade80' : '#93c5fd',
                      padding:'0.5rem', fontWeight:700, fontSize:'0.82rem', cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem',
                    }}>
                      {copied ? <>✅ Copied!</> : <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        Copy code
                      </>}
                    </button>
                    <button onClick={handleDownload} style={{
                      background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)',
                      borderRadius:'8px', color:'var(--text-muted)',
                      padding:'0.5rem 0.8rem', fontWeight:700, fontSize:'0.82rem', cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem',
                    }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      .txt
                    </button>
                  </div>
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
                Paste a backup code below to restore your portfolio. This will <strong style={{ color:'#f87171' }}>overwrite</strong> your current data.
              </p>
              <textarea
                value={importText}
                onChange={e => { setImportText(e.target.value); setError(''); setImportResult(null) }}
                placeholder="Paste backup code (starts with WL1-...)"
                style={{
                  width:'100%', minHeight:'90px',
                  background:'rgba(0,0,0,0.25)', border:'1px solid rgba(59,130,246,0.25)',
                  borderRadius:'8px', color:'#e2e8f0',
                  padding:'0.6rem', fontSize:'0.72rem',
                  fontFamily:'monospace', resize:'vertical', wordBreak:'break-all',
                  boxSizing:'border-box', marginBottom:'0.6rem',
                }}
              />
              <div style={{ display:'flex', gap:'0.5rem', marginBottom:'0.6rem' }}>
                <label style={{
                  flex:1, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.12)',
                  borderRadius:'8px', color:'var(--text-muted)',
                  padding:'0.45rem', fontSize:'0.78rem', cursor:'pointer', textAlign:'center', fontWeight:600,
                }}>
                  📂 Load from file
                  <input type="file" accept=".txt,text/plain" onChange={handleFileUpload} style={{ display:'none' }} />
                </label>
              </div>
              {error && (
                <div style={{
                  background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
                  borderRadius:'8px', color:'#f87171',
                  padding:'0.5rem 0.75rem', fontSize:'0.78rem', marginBottom:'0.6rem',
                }}>
                  ⚠️ {error}
                </div>
              )}
              {importResult ? (
                <div style={{
                  background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.35)',
                  borderRadius:'8px', color:'#4ade80',
                  padding:'0.6rem 0.75rem', fontSize:'0.85rem', textAlign:'center', fontWeight:600,
                }}>
                  ✅ Restored {importResult.restored} data set{importResult.restored !== 1 ? 's' : ''}!
                  <div style={{ fontSize:'0.72rem', fontWeight:400, marginTop:'0.2rem', opacity:0.85 }}>
                    Reloading…
                  </div>
                </div>
              ) : confirmImport ? (
                <div style={{ display:'flex', gap:'0.5rem' }}>
                  <button onClick={handleImport} style={{
                    flex:1, background:'linear-gradient(135deg, #f87171, #dc2626)',
                    border:'none', borderRadius:'8px', color:'#fff',
                    padding:'0.55rem', fontWeight:700, fontSize:'0.82rem', cursor:'pointer',
                  }}>
                    ⚠️ Yes, overwrite my data
                  </button>
                  <button onClick={() => setConfirmImport(false)} style={{
                    background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)',
                    borderRadius:'8px', color:'var(--text-muted)',
                    padding:'0.55rem 0.9rem', fontWeight:700, fontSize:'0.82rem', cursor:'pointer',
                  }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setError(''); if (!importText.trim()) { setError('Paste a backup code first.'); return } setConfirmImport(true) }}
                  disabled={!importText.trim()}
                  style={{
                    width:'100%', background: importText.trim() ? 'linear-gradient(135deg, #3b82f6, #0ea5e9)' : 'rgba(59,130,246,0.2)',
                    border:'none', borderRadius:'10px', color:'#fff',
                    padding:'0.65rem', fontWeight:800, fontSize:'0.88rem',
                    cursor: importText.trim() ? 'pointer' : 'not-allowed',
                    opacity: importText.trim() ? 1 : 0.55,
                    display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem',
                    boxShadow: importText.trim() ? '0 4px 14px rgba(59,130,246,0.35)' : 'none',
                  }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Restore from code
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function BackupIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z"/>
      <path d="M9 12l-2 2 2 2"/>
      <path d="M15 12l2 2-2 2"/>
    </svg>
  )
}
