import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { api } from '../api'

const KEY_STORAGE = 'walletlens_anthropic_key'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

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
    reader.onload = (e) => {
      try {
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

async function callClaudeVision(apiKey, base64, mediaType) {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: `Extract all crypto/stock holdings visible in this portfolio screenshot.
Return ONLY a valid JSON array, no explanation, no markdown fences. Each item must have:
- symbol (string, e.g. "BTC")
- name (string, e.g. "Bitcoin")
- amount (number, the quantity held)
- price (number, price per unit in USD; use 0 if not visible)
- type ("buy" or "hold")
Example: [{"symbol":"BTC","name":"Bitcoin","amount":0.5,"price":65000,"type":"buy"}]` },
        ],
      }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${res.status}`)
  }
  const data = await res.json()
  const text = data.content?.[0]?.text || ''
  // Extract JSON array from the response
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON array found in response')
  return JSON.parse(match[0])
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

export default function SmartImport({ wallets, onImported }) {
  const [mode, setMode] = useState('screenshot') // 'screenshot' | 'spreadsheet'
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('') // 'error' | 'ok'
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? '')
  const [preview, setPreview] = useState(null) // { src } for screenshot

  const today = new Date().toISOString().split('T')[0]

  function showMsg(text, type = 'error') { setMsg(text); setMsgType(type) }
  function clearMsg() { setMsg('') }

  function changeRow(i, field, value) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }
  function removeRow(i) { setRows(prev => prev.filter((_, idx) => idx !== i)) }

  // ── Screenshot handler ──────────────────────────────────────────────────
  async function handleScreenshot(file) {
    const apiKey = localStorage.getItem(KEY_STORAGE) || import.meta.env.VITE_ANTHROPIC_KEY
    if (!apiKey) {
      showMsg('No API key found. Please enter your Anthropic API key in the AI Advisor section first.')
      return
    }
    clearMsg()
    setBusy(true)
    setRows([])
    const src = URL.createObjectURL(file)
    setPreview({ src })
    try {
      const base64 = await fileToBase64(file)
      const mediaType = file.type || 'image/png'
      const extracted = await callClaudeVision(apiKey, base64, mediaType)
      if (!Array.isArray(extracted) || !extracted.length) {
        showMsg('No holdings detected. Try a clearer screenshot.')
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
      showMsg(`Detected ${extracted.length} holding(s) — review and edit below.`, 'ok')
    } catch (e) {
      showMsg('Claude Vision error: ' + e.message)
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
      {/* Mode tabs */}
      <div className="si-tabs">
        <button className={`si-tab${mode === 'screenshot'  ? ' si-tab-active' : ''}`} onClick={() => { setMode('screenshot');  setRows([]); setPreview(null); clearMsg() }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Screenshot
        </button>
        <button className={`si-tab${mode === 'spreadsheet' ? ' si-tab-active' : ''}`} onClick={() => { setMode('spreadsheet'); setRows([]); setPreview(null); clearMsg() }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          Spreadsheet
        </button>
      </div>

      {/* Drop zone */}
      {!rows.length && (
        mode === 'screenshot' ? (
          <DragZone accept="image" icon="📷"
            label={busy ? 'Analysing with Claude AI…' : 'Drop portfolio screenshot here'}
            onFile={handleScreenshot} disabled={busy} />
        ) : (
          <DragZone accept="spreadsheet" icon="📊"
            label={busy ? 'Parsing file…' : 'Drop your Excel or CSV file here'}
            onFile={handleSpreadsheet} disabled={busy} />
        )
      )}

      {/* Screenshot preview thumbnail */}
      {preview && !busy && (
        <div className="si-img-preview">
          <img src={preview.src} alt="uploaded screenshot" />
        </div>
      )}

      {/* Status message */}
      {msg && (
        <div className={`si-msg si-msg-${msgType}`}>{msg}</div>
      )}

      {/* Template hint for spreadsheet */}
      {mode === 'spreadsheet' && !rows.length && !busy && (
        <p className="si-hint">
          Use column headers: <strong>Symbol, Name, Amount, Price, Date, Type</strong> (buy/sell). CSV and XLSX both supported.
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
