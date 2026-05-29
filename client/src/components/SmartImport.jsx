import { useState, useRef, useCallback } from 'react'
import { api } from '../api'
import { parseScreenshotWithClaude } from '../visionAi'
import { track } from '../analytics'

// Column header aliases → canonical field names
const COL_MAP = {
  symbol:  ['symbol','ticker','coin','token','asset','crypto'],
  name:    ['name','coin name','token name','asset name','currency'],
  amount:  ['amount','quantity','qty','balance','holdings','units','holding'],
  price:   ['price','buy price','purchase price','cost','unit price','price per unit','avg price','average price','avg cost'],
  date:    ['date','buy date','purchase date','transaction date','trade date'],
  type:    ['type','action','side','transaction type','direction'],
}

function detectColumn(headers, field) {
  const aliases = COL_MAP[field]
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').toLowerCase().trim()
    if (aliases.includes(h)) return i
  }
  return -1
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function parseSpreadsheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        resolve(rows)
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function DragZone({ accept, label, icon, onFile, disabled }) {
  const [over, setOver] = useState(false)
  const inputRef = useRef()

  const handle = useCallback((file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (accept === 'image') {
      if (!['png','jpg','jpeg','webp','gif'].includes(ext)) return
    } else {
      if (!['xlsx','xls','csv'].includes(ext)) return
    }
    onFile(file)
  }, [accept, onFile])

  return (
    <div
      className={`si-dropzone${over ? ' si-dropzone-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]) }}
      onClick={() => !disabled && inputRef.current?.click()}
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <input ref={inputRef} type="file"
        accept={accept === 'image' ? 'image/*' : '.xlsx,.xls,.csv'}
        style={{ display: 'none' }}
        onChange={e => handle(e.target.files[0])} />
      <span className="si-dropzone-icon">{icon}</span>
      <span className="si-dropzone-label">{label}</span>
      <span className="si-dropzone-hint">
        {accept === 'image' ? 'PNG, JPG, WEBP' : 'XLSX, XLS, CSV'}
      </span>
    </div>
  )
}

function ReviewTable({ rows, onChange, onRemove }) {
  return (
    <div className="si-table-wrap">
      <table className="si-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th>Amount</th>
            <th>Price (USD)</th>
            <th>Type</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><input className="si-cell-input" value={r.symbol} onChange={e => onChange(i,'symbol',e.target.value)} /></td>
              <td><input className="si-cell-input" value={r.name} onChange={e => onChange(i,'name',e.target.value)} /></td>
              <td><input className="si-cell-input si-cell-num" type="number" min="0" value={r.amount} onChange={e => onChange(i,'amount',e.target.value)} /></td>
              <td><input className="si-cell-input si-cell-num" type="number" min="0" value={r.price} onChange={e => onChange(i,'price',e.target.value)} /></td>
              <td>
                <select className="si-cell-input" value={r.type} onChange={e => onChange(i,'type',e.target.value)}>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </td>
              <td><input className="si-cell-input" type="date" value={r.date} onChange={e => onChange(i,'date',e.target.value)} /></td>
              <td><button className="si-remove-btn" onClick={() => onRemove(i)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SmartImport({ wallets, onImported, defaultMode = 'excel' }) {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('')
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? '')
  const [mode, setMode] = useState(defaultMode === 'screenshot' ? 'screenshot' : 'excel')
  const [preview, setPreview] = useState(null)

  const today = new Date().toISOString().split('T')[0]

  function showMsg(text, type = 'error') { setMsg(text); setMsgType(type) }
  function clearMsg() { setMsg('') }

  function changeRow(i, field, value) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }
  function removeRow(i) { setRows(prev => prev.filter((_, idx) => idx !== i)) }

  // ── Screenshot handler (Claude vision via owner-hosted endpoint) ──────────
  async function handleScreenshot(file) {
    clearMsg()
    setBusy(true)
    setRows([])
    const src = URL.createObjectURL(file)
    setPreview({ src })
    track('screenshot_import_start')
    try {
      const base64 = await fileToBase64(file)
      const mediaType = file.type || 'image/png'
      const extracted = await parseScreenshotWithClaude(base64, mediaType)
      if (!Array.isArray(extracted) || !extracted.length) {
        showMsg('No holdings detected. Try a clearer, tighter screenshot of the holdings/trades.')
        return
      }
      setRows(extracted.map(r => ({
        symbol: (r.symbol || '').toUpperCase(),
        name:   r.name || r.symbol || '',
        amount: Number(r.amount) || 0,
        price:  Number(r.price) || 0,
        type:   r.type === 'sell' ? 'sell' : 'buy',
        date:   r.date || today,
      })))
      track('screenshot_import_detected', { count: extracted.length })
      showMsg(`Detected ${extracted.length} holding(s) — review and edit below.`, 'ok')
    } catch (e) {
      showMsg(e.message || 'Could not read that screenshot. Try again or use Excel/CSV.')
    } finally {
      setBusy(false)
    }
  }

  // ── Spreadsheet handler ─────────────────────────────────────────────────
  async function handleSpreadsheet(file) {
    clearMsg()
    setBusy(true)
    setRows([])
    try {
      const raw = await parseSpreadsheet(file)
      if (raw.length < 2) { showMsg('File appears empty.'); return }

      const headers = raw[0].map(h => String(h).toLowerCase().trim())
      const colSymbol = detectColumn(headers, 'symbol')
      const colName   = detectColumn(headers, 'name')
      const colAmount = detectColumn(headers, 'amount')
      const colPrice  = detectColumn(headers, 'price')
      const colDate   = detectColumn(headers, 'date')
      const colType   = detectColumn(headers, 'type')

      if (colSymbol === -1 && colName === -1) {
        showMsg('Could not detect a Symbol or Name column. Use headers: Symbol, Name, Amount, Price, Date, Type')
        return
      }

      const parsed = []
      for (let i = 1; i < raw.length; i++) {
        const row = raw[i]
        const sym  = colSymbol >= 0 ? String(row[colSymbol] || '').toUpperCase().trim() : ''
        const name = colName   >= 0 ? String(row[colName]   || '').trim() : sym
        const amt  = colAmount >= 0 ? parseFloat(row[colAmount]) || 0 : 0
        if (!sym && !name) continue
        if (amt === 0 && colAmount >= 0) continue
        parsed.push({
          symbol: sym || name,
          name:   name || sym,
          amount: amt,
          price:  colPrice >= 0 ? parseFloat(row[colPrice]) || 0 : 0,
          type:   colType  >= 0 ? (String(row[colType]).toLowerCase().includes('sell') ? 'sell' : 'buy') : 'buy',
          date:   colDate  >= 0 && row[colDate] ? String(row[colDate]).trim() : today,
        })
      }
      if (!parsed.length) { showMsg('No valid rows found. Check your column headers.'); return }
      setRows(parsed)
      showMsg(`Parsed ${parsed.length} row(s) — review and edit below.`, 'ok')
    } catch (e) {
      showMsg('Parse error: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────
  async function doImport() {
    if (!rows.length) return
    if (!walletId) { showMsg('Please select a wallet first.'); return }
    const valid = rows.filter(r => r.symbol && r.amount > 0)
    if (!valid.length) { showMsg('No valid rows to import (need symbol + amount > 0).'); return }
    setBusy(true)
    clearMsg()
    try {
      for (const r of valid) {
        const sym = r.symbol.toLowerCase()
        await api.addTransaction({
          wallet_id:     walletId,
          type:          r.type,
          category:      'crypto',
          coin_id:       sym,
          coin_symbol:   r.symbol,
          coin_name:     r.name || r.symbol,
          coin_image:    '',
          amount:        parseFloat(r.amount),
          price_per_unit: parseFloat(r.price) || 0,
          exchange:      mode === 'screenshot' ? 'Screenshot Import' : 'Spreadsheet Import',
          notes:         '',
          date:          r.date || today,
        })
      }
      showMsg(`Imported ${valid.length} transaction(s) successfully!`, 'ok')
      setRows([])
      setPreview(null)
      onImported?.()
    } catch (e) {
      showMsg('Import error: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="si-root">
      {/* Mode toggle: Screenshot (AI) vs Excel / CSV */}
      {!rows.length && (
        <div className="si-tabs">
          <button
            className={`si-tab${mode === 'screenshot' ? ' si-tab-active' : ''}`}
            onClick={() => { setMode('screenshot'); clearMsg(); setPreview(null) }}
            disabled={busy}
          >📸 Screenshot</button>
          <button
            className={`si-tab${mode === 'excel' ? ' si-tab-active' : ''}`}
            onClick={() => { setMode('excel'); clearMsg(); setPreview(null) }}
            disabled={busy}
          >📊 Excel / CSV</button>
        </div>
      )}

      {/* Drop zone */}
      {!rows.length && mode === 'screenshot' && (
        <DragZone accept="image" icon="📸"
          label={busy ? 'Reading screenshot…' : 'Drop or tap to upload a screenshot'}
          onFile={handleScreenshot} disabled={busy} />
      )}
      {!rows.length && mode === 'excel' && (
        <DragZone accept="spreadsheet" icon="📊"
          label={busy ? 'Parsing file…' : 'Drop your Excel or CSV file here'}
          onFile={handleSpreadsheet} disabled={busy} />
      )}

      {/* Screenshot preview */}
      {preview?.src && (
        <div className="si-img-preview">
          <img src={preview.src} alt="screenshot preview" />
        </div>
      )}

      {/* Status message */}
      {msg && (
        <div className={`si-msg si-msg-${msgType}`}>{msg}</div>
      )}

      {/* Template hint */}
      {!rows.length && !busy && mode === 'excel' && (
        <p className="si-hint">
          Use column headers: <strong>Symbol, Name, Amount, Price, Date, Type</strong> (buy/sell). CSV and XLSX both supported.
        </p>
      )}
      {!rows.length && !busy && mode === 'screenshot' && (
        <p className="si-hint">
          Upload a screenshot of your exchange/wallet holdings or trade history — AI reads it and fills in the trades for you to review.
        </p>
      )}

      {/* Review table */}
      {rows.length > 0 && (
        <>
          <ReviewTable rows={rows} onChange={changeRow} onRemove={removeRow} />

          {/* Wallet selector + import */}
          <div className="si-import-bar">
            <select className="si-select" value={walletId} onChange={e => setWalletId(Number(e.target.value))}>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button className="dvx-btn dvx-btn-primary" onClick={doImport} disabled={busy || !rows.length}>
              {busy ? 'Importing…' : `Import ${rows.filter(r => r.symbol && r.amount > 0).length} Rows`}
            </button>
            <button className="dvx-btn" onClick={() => { setRows([]); setPreview(null); clearMsg() }}>
              Clear
            </button>
          </div>
        </>
      )}
    </div>
  )
}
