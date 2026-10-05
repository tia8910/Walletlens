import { useState, useRef, useCallback } from 'react'
import { noteMoment, noteFriction } from '../reviewPrompt'
import { noteSupportFriction } from '../supportNudge'
import { api } from '../api'
import { reclassifyAsset } from '../data/assets'
import { parseScreenshotWithClaude } from '../visionAi'
import { track, trackImport, importCompleted, trackProfileCreated } from '../analytics'
import Icon from './Icon'
import { useLanguage } from '../LanguageContext'
import AiReport from './AiReport'

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

// Validate + filter image files from a FileList/array
function filterImageFiles(files) {
  return Array.from(files).filter(f => {
    const ext = (f.name.split('.').pop() || '').toLowerCase()
    return ['png','jpg','jpeg','webp','gif'].includes(ext)
  })
}

// ── Which asset a row is ──────────────────────────────────────────────────────
// A screenshot or sheet gives a ticker. The row used to be saved as a crypto
// under that ticker lowercased, so USDT became "usdt" beside the "tether" the
// Pay-with chips use, and gold a crypto "xau" beside the real gold: the same
// asset twice. Now, in order:
//   1. an asset already held under that ticker is that asset — whatever its
//      class, so a stock or a metal is not re-filed as crypto;
//   2. otherwise the market ranking's coin with that ticker (highest first);
//   3. otherwise the ticker, which addTransaction still files as gold, silver
//      or cash when that is what it is.
export function makeAssetPicker(holdings = [], market = []) {
  const held = {}
  for (const h of [...holdings].sort((a, b) => (b.value || b.total_invested || 0) - (a.value || a.total_invested || 0))) {
    const k = String(h.coin_symbol || '').toUpperCase()
    if (k && !held[k]) held[k] = h
  }
  const listed = {}
  for (const c of market) {
    const k = String(c.symbol || '').toUpperCase()
    if (k && !listed[k]) listed[k] = c
  }
  return (symbol, name) => {
    const k = String(symbol || '').toUpperCase().trim()
    const h = held[k]
    if (h) return { category: h.category || 'crypto', coin_id: h.coin_id, coin_symbol: h.coin_symbol || k, coin_name: h.coin_name || name || k, coin_image: h.coin_image || '' }
    const m = listed[k]
    if (m) return { category: 'crypto', coin_id: m.id, coin_symbol: k, coin_name: m.name || name || k, coin_image: m.image || '' }
    return { category: 'crypto', coin_id: k.toLowerCase(), coin_symbol: k, coin_name: name || k, coin_image: '' }
  }
}

// ── Tidy what the reader found ────────────────────────────────────────────────
// Several screenshots of one portfolio overlap, and a reader sometimes puts a
// row's total value where the unit price goes. Before anyone reviews them:
//   1. the same holding seen twice — same ticker, or same name, and the same
//      amount — is one row ("ST" and "STONKBROKER", both StonkBroker 26,339);
//   2. a price that is really the row's value is divided back to a unit price,
//      when the market price says so (500 AR "at" 2,177 is 500 AR at 4.35);
//   3. a missing price takes the market's.
// `marketPrice(row)` gives the live USD price for a row, or 0 when unknown.
export function tidyImportRows(rows, marketPrice = () => 0) {
  const sig = (n) => Number(n || 0).toPrecision(6)
  const name = (r) => String(r.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const out = []
  for (const r of rows) {
    const dup = out.find(o => sig(o.amount) === sig(r.amount) && o.type === r.type &&
      (o.symbol === r.symbol || (name(o) && name(o) === name(r))))
    if (dup) {
      // Keep the fuller reading of the two.
      if (String(r.symbol).length > String(dup.symbol).length) dup.symbol = r.symbol
      if (!(dup.price > 0) && r.price > 0) dup.price = r.price
      continue
    }
    out.push({ ...r })
  }
  for (const r of out) {
    const m = marketPrice(r)
    if (!(m > 0)) continue
    const amt = Number(r.amount) || 0
    const px = Number(r.price) || 0
    if (!(px > 0)) { r.price = m; continue }
    const off = (v) => Math.max(v / m, m / v)
    // Only when the unit price is far from the market and the price read as a
    // value lands close to it: a real fill at a different price is left alone.
    if (amt > 0 && off(px) > 3 && off(px / amt) < 1.6) r.price = px / amt
  }
  return out
}

async function importAssetPicker() {
  const [holdings, market] = await Promise.all([
    Promise.resolve(api.getPortfolio()).catch(() => []),
    Promise.resolve(api.getMarketData()).catch(() => []),
  ])
  return makeAssetPicker(Array.isArray(holdings) ? holdings : [], Array.isArray(market) ? market : [])
}

// ── Multi-image drop zone ─────────────────────────────────────────────────────
// Accepts multiple files at once — via drag-drop, file picker (Ctrl/Cmd+click),
// or the camera roll on mobile.
function MultiDragZone({ busy, onFiles, compact = false }) {
  const { t } = useLanguage()
  const [over, setOver] = useState(false)
  const inputRef = useRef()

  const handle = useCallback((fileList) => {
    const imgs = filterImageFiles(fileList)
    if (imgs.length) onFiles(imgs)
  }, [onFiles])

  return (
    <div
      className={`si-dropzone${over ? ' si-dropzone-over' : ''}${compact ? ' si-dropzone-compact' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files) }}
      onClick={() => !busy && inputRef.current?.click()}
      style={{ opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => { handle(e.target.files); e.target.value = '' }}
      />
      <span className="si-dropzone-icon"><Icon name={compact ? 'plus' : 'camera'} size={compact ? 18 : 24} /></span>
      <span className="si-dropzone-label">
        {compact ? t('siAddMore') : t('siDropLabel')}
      </span>
      {!compact && <span className="si-dropzone-hint">{t('siPngJpg')}</span>}
    </div>
  )
}

// ── Single-file drop zone (spreadsheet) ──────────────────────────────────────
function DragZone({ accept, label, icon, onFile, disabled }) {
  const { t } = useLanguage()
  const [over, setOver] = useState(false)
  const inputRef = useRef()

  const handle = useCallback((file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xlsx','xls','csv'].includes(ext)) return
    onFile(file)
  }, [onFile])

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
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={e => handle(e.target.files[0])} />
      <span className="si-dropzone-icon"><Icon name={icon} size={24} /></span>
      <span className="si-dropzone-label">{label}</span>
      <span className="si-dropzone-hint">{t('siXlsx')}</span>
    </div>
  )
}

// ── Thumbnail strip ──────────────────────────────────────────────────────────
// Shows each screenshot with a status badge: queued, spinning reading,
// ✓ N found, ✗ error. Lets the user see exactly which screenshots were read
// and how many holdings each one contributed.
function ThumbStrip({ previews }) {
  if (!previews.length) return null
  return (
    <div className="si-thumb-strip">
      {previews.map((p, i) => (
        <div key={i} className={`si-thumb si-thumb-${p.status}`}>
          {/* A format the browser can read but not draw (HEIC) still imports;
              show a plain tile rather than a broken image and its alt text. */}
          <img src={p.src} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
          <span className="si-thumb-badge">
            {p.status === 'reading'  && <span className="si-thumb-spin" />}
            {p.status === 'queued'   && <Icon name="hourglass" size={13} />}
            {p.status === 'done'     && `✓ ${p.count}`}
            {p.status === 'error'    && '✗'}
          </span>
        </div>
      ))}
    </div>
  )
}

function ReviewTable({ rows, onChange, onRemove }) {
  const { t } = useLanguage()
  return (
    <div className="si-table-wrap">
      <table className="si-table">
        <thead>
          <tr>
            <th>{t('siSymbol')}</th>
            <th>{t('vsName')}</th>
            <th>{t('txAmount')}</th>
            <th>{t('siPriceUsd')}</th>
            <th>{t('vsType')}</th>
            <th>{t('txDate')}</th>
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
                  <option value="buy">{t('buy')}</option>
                  <option value="sell">{t('sell')}</option>
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

/**
 * Whether this failure means the image could not be READ, or could not be SENT.
 *
 * visionAi throws a written sentence when no endpoint answered, and a bare
 * TypeError when the request itself never completed. Either way nothing about
 * the screenshot is at fault, and telling someone to take a clearer photo is
 * the worst possible response.
 */
function isUnreachable(e) {
  const m = String(e?.message || e || '')
  return /Failed to fetch|NetworkError|Load failed|AI endpoint|unavailable/i.test(m)
}

export default function SmartImport({ wallets, onImported, defaultMode = 'excel' }) {
  const { t } = useLanguage()
  const [rows, setRows]         = useState([])
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState('')
  const [msgType, setMsgType]   = useState('')
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? '')
  const [mode, setMode]         = useState(defaultMode === 'screenshot' ? 'screenshot' : 'excel')
  const [previews, setPreviews] = useState([])   // [{src, status, count}]

  const today = new Date().toISOString().split('T')[0]

  function showMsg(text, type = 'error') { setMsg(text); setMsgType(type) }
  function clearMsg() { setMsg('') }

  function changeRow(i, field, value) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }
  function removeRow(i) { setRows(prev => prev.filter((_, idx) => idx !== i)) }

  // ── Multi-screenshot handler ───────────────────────────────────────────────
  // Processes files sequentially so we don't hammer the AI endpoint in parallel.
  // Each screenshot transitions through: queued → reading → done|error.
  // Extracted rows are appended to the existing table so the user can build up
  // the full picture from multiple exchanges / wallets before hitting Import.
  async function handleScreenshots(files) {
    if (!files.length) return
    clearMsg()
    setBusy(true)
    trackImport({ method: 'screenshot', step: 'started' })

    // Register all files as queued thumbnails first so the user sees them immediately
    const startIdx = previews.length
    const newPreviews = files.map(f => ({
      src: URL.createObjectURL(f),
      status: 'queued',
      count: 0,
    }))
    setPreviews(prev => [...prev, ...newPreviews])

    let totalAdded = 0
    // What was on the table before this batch, plus what this batch reads.
    const before = rowsRef.current
    const batch = []
    let errors = 0
    let unreachable = false

    for (let i = 0; i < files.length; i++) {
      const thumbIdx = startIdx + i

      // Mark as reading
      setPreviews(prev => prev.map((p, idx) => idx === thumbIdx ? { ...p, status: 'reading' } : p))

      try {
        const file = files[i]
        const base64    = await fileToBase64(file)
        const mediaType = file.type || 'image/png'
        const extracted = await parseScreenshotWithClaude(base64, mediaType)

        if (!Array.isArray(extracted) || !extracted.length) {
          setPreviews(prev => prev.map((p, idx) => idx === thumbIdx ? { ...p, status: 'error', count: 0 } : p))
          errors++
          continue
        }

        const newRows = extracted.map(r => ({
          symbol: (r.symbol || '').toUpperCase(),
          name:   r.name || r.symbol || '',
          amount: Number(r.amount) || 0,
          price:  Number(r.price)  || 0,
          type:   r.type === 'sell' ? 'sell' : 'buy',
          date:   r.date || today,
        }))

        batch.push(...newRows)
        setRows(prev => [...prev, ...newRows])
        setPreviews(prev => prev.map((p, idx) => idx === thumbIdx ? { ...p, status: 'done', count: extracted.length } : p))
        totalAdded += extracted.length

        // Was { count: extracted.length } — how many holdings the OCR found in
        // the user's exchange screenshot, which is an asset count and named in
        // the contract. The step is the signal; the size of their portfolio is
        // not ours to send.
        trackImport({ method: 'screenshot', step: 'parsed' })
      } catch (e) {
        setPreviews(prev => prev.map((p, idx) => idx === thumbIdx ? { ...p, status: 'error' } : p))
        // Counted per screenshot, because a user can succeed on three and fail
        // on one and the old events could not tell that from a clean run.
        trackImport({ method: 'screenshot', step: 'failed', reason: 'read_error' })
        // "No holdings detected — try clearer shots" was shown for this too,
        // which is advice to re-photograph an exchange for a request that was
        // never sent. A failure to reach the reader is not a failure to read.
        unreachable = unreachable || isUnreachable(e)
        errors++
      }
    }

    // One pass over everything read so far, this batch and earlier ones.
    if (totalAdded > 0) {
      try {
        const pick = await importAssetPicker()
        const current = [...before, ...batch]
        // Gold or cash read as a ticker is priced under its own id.
        const idOf = (r) => { const a = pick(r.symbol, r.name); return reclassifyAsset(a.coin_id, a.coin_symbol, a.category)?.coin_id || a.coin_id }
        const ids = [...new Set(current.map(idOf))]
        const px = ids.length ? await Promise.resolve(api.getPrices(ids.join(','))).catch(() => ({})) : {}
        const tidy = tidyImportRows(current, r => Number(px?.[idOf(r)]?.usd) || 0)
        setRows(tidy)
        totalAdded = tidy.length
      } catch { /* the rows stay as read; the review table is still editable */ }
    }

    setBusy(false)

    if (totalAdded > 0 && errors === 0) {
      showMsg(t('siDetected').replace('{n}', totalAdded), 'ok')
    } else if (totalAdded > 0) {
      showMsg(t('siDetectedPartial').replace('{n}', totalAdded).replace('{e}', errors), 'ok')
    } else if (unreachable) {
      trackImport({ method: 'screenshot', step: 'failed', reason: 'unreachable' })
      showMsg(t('errImportUnreachable'))
    } else {
      trackImport({ method: 'screenshot', step: 'failed', reason: 'nothing_detected' })
      showMsg(t('errNoHoldingsDetected'))
    }
  }

  // ── Spreadsheet handler ───────────────────────────────────────────────────
  async function handleSpreadsheet(file) {
    clearMsg()
    setBusy(true)
    setRows([])
    // The whole spreadsheet path was invisible in GA until here: its only
    // event was the profile_created fired after a SUCCESSFUL save, so every
    // way of failing looked identical to never having tried.
    const format = (file?.name || '').split('.').pop()?.toLowerCase() || 'unknown'
    trackImport({ method: 'spreadsheet', step: 'started', format })
    try {
      const raw = await parseSpreadsheet(file)
      if (raw.length < 2) {
        trackImport({ method: 'spreadsheet', step: 'failed', reason: 'empty_file', format })
        showMsg(t('errFileEmpty')); return
      }

      const headers   = raw[0].map(h => String(h).toLowerCase().trim())
      const colSymbol = detectColumn(headers, 'symbol')
      const colName   = detectColumn(headers, 'name')
      const colAmount = detectColumn(headers, 'amount')
      const colPrice  = detectColumn(headers, 'price')
      const colDate   = detectColumn(headers, 'date')
      const colType   = detectColumn(headers, 'type')

      if (colSymbol === -1 && colName === -1) {
        // The most actionable failure in the funnel: the file was readable and
        // we could not find a symbol or name column. A run of these is a
        // parser gap, not a user error.
        trackImport({ method: 'spreadsheet', step: 'failed', reason: 'no_columns', format })
        showMsg(t('siNoColumns'))
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
      if (!parsed.length) {
        trackImport({ method: 'spreadsheet', step: 'failed', reason: 'no_valid_rows', format })
        showMsg(t('errNoValidRows')); return
      }
      setRows(parsed)
      trackImport({ method: 'spreadsheet', step: 'parsed', format })
      showMsg(t('siParsed').replace('{n}', parsed.length), 'ok')
    } catch (e) {
      // A fixed code, not e.message: parse exceptions routinely quote the
      // filename and the offending cell, and neither belongs in GA.
      trackImport({ method: 'spreadsheet', step: 'failed', reason: 'parse_error', format })
      noteFriction('import_failed')
      noteSupportFriction('import_failed')
      showMsg(t('errParsePrefix') + e.message)
    } finally {
      setBusy(false)
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────
  async function doImport() {
    if (!rows.length) return
    if (!walletId) { showMsg(t('errSelectWallet')); return }
    const valid = rows.filter(r => r.symbol && r.amount > 0)
    if (!valid.length) { showMsg(t('errNoRowsToImport')); return }
    setBusy(true)
    clearMsg()
    try {
      const pick = await importAssetPicker()
      for (const r of valid) {
        const asset = pick(r.symbol, r.name)
        await api.addTransaction({
          wallet_id:      walletId,
          type:           r.type,
          ...asset,
          amount:         parseFloat(r.amount),
          price_per_unit: parseFloat(r.price) || 0,
          exchange:       mode === 'screenshot' ? 'Screenshot Import' : 'Spreadsheet Import',
          notes:          '',
          date:           r.date || today,
        })
      }
      trackProfileCreated({
        method: mode === 'screenshot' ? 'screenshot' : 'spreadsheet',
        source: 'smart_import',
      })
      // profile_created fires only on a user's FIRST portfolio; this fires on
      // every import, which is what makes the funnel add up.
      const doneMethod = mode === 'screenshot' ? 'screenshot' : 'spreadsheet'
      trackImport({ method: doneMethod, step: 'saved' })
      importCompleted({ method: doneMethod })
      showMsg(t('siImported').replace('{n}', valid.length), 'ok')
      setRows([])
      setPreviews([])
      // A screenshot or spreadsheet just turned into a portfolio — the payoff
      // moment for the feature people are most impressed by.
      noteMoment('import_success')
      onImported?.()
      window.dispatchEvent(new Event("wl:portfolio-updated"))
    } catch (e) {
      // The write itself failed, which is the worst kind: they did the work
      // and got nothing. Stay off the review card for a while.
      trackImport({
        method: mode === 'screenshot' ? 'screenshot' : 'spreadsheet',
        step: 'failed',
        reason: 'save_error',
      })
      noteFriction('import_failed')
      noteSupportFriction('import_failed')
      showMsg(t('errImportPrefix') + e.message)
    } finally {
      setBusy(false)
    }
  }

  function handleClear() {
    setRows([])
    setPreviews([])
    clearMsg()
  }

  return (
    <div className="si-root">
      {/* Mode toggle — hidden while reviewing rows */}
      {!rows.length && !previews.length && (
        <div className="si-tabs">
          <button
            className={`si-tab${mode === 'screenshot' ? ' si-tab-active' : ''}`}
            onClick={() => { setMode('screenshot'); clearMsg() }}
            disabled={busy}
          ><Icon name="camera" size={14} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />{t('siScreenshot')}</button>
          <button
            className={`si-tab${mode === 'excel' ? ' si-tab-active' : ''}`}
            onClick={() => { setMode('excel'); clearMsg() }}
            disabled={busy}
          ><Icon name="bar-chart" size={14} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />{t('siExcelCsv')}</button>
        </div>
      )}

      {/* Drop zones — screenshot accepts multiple, shown also when reviewing */}
      {mode === 'screenshot' && !rows.length && !previews.length && (
        <MultiDragZone busy={busy} onFiles={handleScreenshots} />
      )}
      {mode === 'excel' && !rows.length && (
        <DragZone accept="spreadsheet" icon="bar-chart"
          label={busy ? 'Parsing file…' : 'Drop your Excel or CSV file here'}
          onFile={handleSpreadsheet} disabled={busy} />
      )}

      {/* Thumbnail strip — shown during and after reading */}
      {mode === 'screenshot' && previews.length > 0 && (
        <ThumbStrip previews={previews} />
      )}

      {/* Status message */}
      {msg && <div className={`si-msg si-msg-${msgType}`}>{msg}</div>}

      {/* Hints */}
      {!rows.length && !busy && !previews.length && mode === 'excel' && (
        <p className="si-hint">
          {t('siUseHeaders')} <strong>{t('siHeaderList')}</strong> {t('siBuySell')}
        </p>
      )}
      {!rows.length && !busy && !previews.length && mode === 'screenshot' && (
        <p className="si-hint">
          {t('siMultiShots')}
        </p>
      )}

      {/* Review table + add-more zone */}
      {rows.length > 0 && (
        <>
          <ReviewTable rows={rows} onChange={changeRow} onRemove={removeRow} />
          {mode === 'screenshot' && <AiReport surface="screenshot_import" compact output={() => JSON.stringify(rows.slice(0, 40))} />}

          {/* Add more screenshots while reviewing */}
          {mode === 'screenshot' && (
            <MultiDragZone busy={busy} onFiles={handleScreenshots} compact />
          )}

          {/* Wallet selector + import */}
          <div className="si-import-bar">
            <select className="si-select" value={walletId} onChange={e => setWalletId(Number(e.target.value))}>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button className="dvx-btn dvx-btn-primary" onClick={doImport} disabled={busy || !rows.length}>
              {busy ? 'Importing…' : `Import ${rows.filter(r => r.symbol && r.amount > 0).length} Rows`}
            </button>
            <button className="dvx-btn" onClick={handleClear}>{t('siClear')}</button>
          </div>
        </>
      )}
    </div>
  )
}
