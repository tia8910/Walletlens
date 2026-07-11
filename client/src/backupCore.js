// Core backup logic shared by the Backup panel and the weekly email-backup
// subscription. Pure functions — no React — so they can run on app open too.
import QRCode from 'qrcode'

export const BACKUP_KEYS = [
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
  // Portfolio Guardian identity — including these means restoring a backup on a
  // new device recovers the SAME Guardian registration, so a lost phone doesn't
  // leave the dead-man's switch stranded (it can be reset/cancelled again).
  'wl_guardian',
  'wl_guardian_device_id',
]

// ── Compression helpers (WL3/WL2 format) ──────────────────────────────────
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

// WL3 format — compact parsed objects, coin_image stripped (re-fetched on load),
// empty optional fields omitted. Avoids the double-encoding of WL2.
export async function generateBackupCode() {
  const txsRaw = localStorage.getItem('crypto_tracker_transactions')
  const wsRaw  = localStorage.getItem('crypto_tracker_wallets')
  const txs = txsRaw ? JSON.parse(txsRaw) : []
  const ws  = wsRaw  ? JSON.parse(wsRaw)  : []

  const compactTxs = txs.map(tx => {
    // eslint-disable-next-line no-unused-vars
    const { coin_image, ...rest } = tx
    const out = { ...rest }
    if (!out.exchange)                     delete out.exchange
    if (!out.notes)                        delete out.notes
    if (!out.fee && out.fee !== 0)         delete out.fee
    if (out.fee === 0)                     delete out.fee
    if (!out.category || out.category === 'crypto') delete out.category
    return out
  })

  const payload = { v: 3, ts: Date.now(), txs: compactTxs, ws }

  const wId = localStorage.getItem('crypto_tracker_next_wallet_id')
  const tId = localStorage.getItem('crypto_tracker_next_tx_id')
  const eId = localStorage.getItem('crypto_tracker_next_ex_id')
  if (wId || tId || eId) payload.ids = { w: wId || '1', t: tId || '1', e: eId || '1' }

  const OPT = {
    ct: 'crypto_tracker_coin_targets', cn: 'crypto_tracker_coin_notes',
    mp: 'crypto_tracker_manual_prices', st: 'wl_settings',
    cv: 'wl_card_vis',                  ex: 'crypto_tracker_exchanges',
    gd: 'wl_guardian',                  gi: 'wl_guardian_device_id',
  }
  for (const [alias, key] of Object.entries(OPT)) {
    const raw = localStorage.getItem(key)
    // Most blobs are JSON; wl_guardian_device_id is a plain string — keep it raw.
    if (raw != null) { try { payload[alias] = JSON.parse(raw) } catch { payload[alias] = raw } }
  }

  const json = JSON.stringify(payload)
  const compressed = await gzipB64(json)
  const code = compressed ? `WL3-${compressed}` : `WL1-${b64encode(json)}`
  return { code, txCount: txs.length, walletCount: ws.length }
}

export async function applyBackupCode(raw) {
  const code = (raw || '').trim().replace(/\s+/g, '')
  if (!code) throw new Error('Paste a backup code first.')

  let json
  if (code.startsWith('WL3-') || code.startsWith('WL2-')) {
    try { json = await gunzipB64(code.slice(4)) }
    catch { throw new Error('Could not decompress backup code — make sure you copied it completely.') }
  } else {
    const b64 = code.startsWith('WL1-') ? code.slice(4) : code
    try { json = b64decode(b64) }
    catch { throw new Error('Could not decode backup code — make sure you copied it completely.') }
  }

  let parsed
  try { parsed = JSON.parse(json) } catch { throw new Error('Backup data is corrupted or incomplete.') }

  if (parsed?.v === 3) {
    if (!Array.isArray(parsed.txs)) throw new Error('Backup data is missing or corrupted.')
    const txs = parsed.txs.map(tx => ({ coin_image: '', category: 'crypto', ...tx }))
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify(txs))
    localStorage.setItem('crypto_tracker_wallets', JSON.stringify(parsed.ws || []))
    if (parsed.ids) {
      if (parsed.ids.w) localStorage.setItem('crypto_tracker_next_wallet_id', String(parsed.ids.w))
      if (parsed.ids.t) localStorage.setItem('crypto_tracker_next_tx_id', String(parsed.ids.t))
      if (parsed.ids.e) localStorage.setItem('crypto_tracker_next_ex_id', String(parsed.ids.e))
    }
    const OPT = {
      ct: 'crypto_tracker_coin_targets', cn: 'crypto_tracker_coin_notes',
      mp: 'crypto_tracker_manual_prices', st: 'wl_settings',
      cv: 'wl_card_vis',                  ex: 'crypto_tracker_exchanges',
      gd: 'wl_guardian',                  gi: 'wl_guardian_device_id',
    }
    let restored = 2
    for (const [alias, key] of Object.entries(OPT)) {
      if (parsed[alias] != null) {
        const v = parsed[alias]
        localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v))
        restored++
      }
    }
    return { restored, when: parsed.ts ? new Date(parsed.ts) : null }
  }

  // Legacy WL1/WL2 — data-bag of raw localStorage strings
  if (!parsed?.data || typeof parsed.data !== 'object') throw new Error('Backup data is missing or corrupted.')
  let restored = 0
  for (const [key, val] of Object.entries(parsed.data)) {
    if (BACKUP_KEYS.includes(key) && typeof val === 'string') {
      localStorage.setItem(key, val); restored++
    }
  }
  return { restored, when: parsed.ts ? new Date(parsed.ts) : null }
}

// ── QR helpers ────────────────────────────────────────────────────────────
export const QR_CHUNK = 1200

export async function makeQrDataUrl(data) {
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: 'L', margin: 2, scale: 5,
    color: { dark: '#000000', light: '#ffffff' },
  }).catch(() => '')
}

// Returns [{idx, total, url}, ...]. Single-element for small codes.
export async function makeQrParts(code) {
  if (code.length <= QR_CHUNK) {
    const url = await makeQrDataUrl(code)
    return url ? [{ idx: 1, total: 1, url }] : []
  }
  const total = Math.ceil(code.length / QR_CHUNK)
  const parts = []
  for (let i = 0; i < total; i++) {
    const chunk = code.slice(i * QR_CHUNK, (i + 1) * QR_CHUNK)
    const url = await makeQrDataUrl(`WQ${i + 1}/${total}:${chunk}`)
    if (!url) return []
    parts.push({ idx: i + 1, total, url })
  }
  return parts
}
