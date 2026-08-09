import { useState, useRef, useCallback } from 'react'
import { api } from '../api'
import { parseScreenshotWithClaude } from '../visionAi'
import { track, trackProfileCreated } from '../analytics'
import Icon from './Icon'
import { useLanguage } from '../LanguageContext'

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
        {compact ? 'Add more screenshots' : 'Drop screenshots here or tap to select'}
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
          <img src={p.src} alt={`screenshot ${i + 1}`} />
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

export default function SmartImport({ wallets, onImported, defaultMode = 'excel' }) {
  const { t } = useLanguage()
  const [rows, setRows]         = useState([])
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
    track('screenshot_import_start', { count: files.length })

    // Register all files as queued thumbnails first so the user sees them immediately
    const startIdx = previews.length
    const newPreviews = files.map(f => ({
      src: URL.createObjectURL(f),
      status: 'queued',
      count: 0,
    }))
    setPreviews(prev => [...prev, ...newPreviews])

    let totalAdded = 0
    let errors = 0

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

        setRows(prev => [...prev, ...newRows])
        setPreviews(prev => prev.map((p, idx) => idx === thumbIdx ? { ...p, status: 'done', count: extracted.length } : p))
        totalAdded += extracted.length

        track('screenshot_import_detected', { count: extracted.length, screenshot: i + 1 })
      } catch {
        setPreviews(prev => prev.map((p, idx) => idx === thumbIdx ? { ...p, status: 'error' } : p))
        errors++
      }
    }

    setBusy(false)

    if (totalAdded > 0 && errors === 0) {
      showMsg(`Detected ${totalAdded} holding(s) from ${files.length} screenshot${files.length > 1 ? 's' : ''} — review and edit below.`, 'ok')
    } else if (totalAdded > 0) {
      showMsg(`Detected ${totalAdded} holding(s) — ${errors} screenshot${errors > 1 ? 's' : ''} could not be read. Review and edit below.`, 'ok')
    } else {
      showMsg(t('errNoHoldingsDetected'))
    }
  }

  // ── Spreadsheet handler ───────────────────────────────────────────────────
  async function handleSpreadsheet(file) {
    clearMsg()
    setBusy(true)
    setRows([])
    try {
      const raw = await parseSpreadsheet(file)
      if (raw.length < 2) { showMsg(t('errFileEmpty')); return }

      const headers   = raw[0].map(h => String(h).toLowerCase().trim())
      const colSymbol = detectColumn(headers, 'symbol')
      const colName   = detectColumn(headers, 'name')
      const colAmount = detectColumn(headers, 'amount')
      const colPrice  = detectColumn(headers, 'price')
      const colDate   = detectColumn(headers, 'date')
      const colType   = detectColumn(headers, 'type')

      if (colSymbol === -1 && colName === -1) {
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
      if (!parsed.length) { showMsg(t('errNoValidRows')); return }
      setRows(parsed)
      showMsg(`Parsed ${parsed.length} row(s) — review and edit below.`, 'ok')
    } catch (e) {
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
      for (const r of valid) {
        const sym = r.symbol.toLowerCase()
        await api.addTransaction({
          wallet_id:      walletId,
          type:           r.type,
          category:       'crypto',
          coin_id:        sym,
          coin_symbol:    r.symbol,
          coin_name:      r.name || r.symbol,
          coin_image:     '',
          amount:         parseFloat(r.amount),
          price_per_unit: parseFloat(r.price) || 0,
          exchange:       mode === 'screenshot' ? 'Screenshot Import' : 'Spreadsheet Import',
          notes:          '',
          date:           r.date || today,
        })
      }
      trackProfileCreated({
        method: mode === 'screenshot' ? 'screenshot' : 'spreadsheet',
        assetCount: valid.length,
        source: 'smart_import',
      })
      showMsg(`Imported ${valid.length} transaction(s) successfully!`, 'ok')
      setRows([])
      setPreviews([])
      onImported?.()
    } catch (e) {
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
