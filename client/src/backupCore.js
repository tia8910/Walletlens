// Core backup logic shared by the Backup panel and the weekly email-backup
// subscription. Pure functions — no React — so they can run on app open too.
import QRCode from 'qrcode'

// Everything that makes up someone's profile, as a single alias -> key table.
//
// This is the ONE list. It used to be three: BACKUP_KEYS (used only by the
// legacy restore path) plus an `OPT` map written out by hand in both
// generateBackupCode and applyBackupCode. Three lists that had to agree, so of
// course they drifted, and Goals, the watchlist, risk budgets and the P&L
// baseline were being dropped on every restore with no error and no warning.
// Both paths now iterate this table, so a field added here is automatically
// written and read.
//
// The short aliases keep the QR payload small. EXISTING ALIASES MUST NEVER
// CHANGE MEANING: codes already in the wild are decoded with this table.
export const BACKUP_FIELDS = {
  // ── Portfolio ────────────────────────────────────────────────────────────
  // Note: one transactions store holds every asset class, not just coins.
  // Stocks, metals, cash and real estate are all rows in it. The key is legacy.
  ct: 'crypto_tracker_coin_targets',
  cn: 'crypto_tracker_coin_notes',
  mp: 'crypto_tracker_manual_prices',
  ex: 'crypto_tracker_exchanges',
  // Migrations key off this. Restoring data without it can leave a newer
  // snapshot being re-migrated by an older device.
  sv: 'crypto_tracker_schema_version',

  // ── Goals and planning ───────────────────────────────────────────────────
  gl: 'wl_goals',
  vb: 'vision_buckets',
  vi: 'crypto_tracker_next_vision_id',
  rb: 'wl_risk_budgets',
  // Baseline the daily P&L is measured against. Lose it and the new device
  // reports a fictional gain on first open.
  pb: 'wl_portfolio_baseline',

  // ── Watchlist and alerts ─────────────────────────────────────────────────
  wt: 'wl_watchlist',
  wa: 'wl_watchlist_alerts',
  // Id counters travel with the records they number, or restored alerts
  // collide with ones created later on the new device.
  ai: 'wl_alert_id',
  aq: 'wl_wl_alert_seq',

  // ── Preferences ──────────────────────────────────────────────────────────
  st: 'wl_settings',
  cv: 'wl_card_vis',
  th: 'wl_theme',
  md: 'wl_mode',
  lg: 'wl_lang',
  hv: 'crypto_tracker_hide_values',
  it: 'wl_interests',
  iu: 'wl_interests_done',
  na: 'wl_native_assets',
  // Which push channels the user wants and how big a move is worth a buzz.
  // A considered choice, not device state: someone who turned the daily brief
  // on and the come-back nudges off should not have to say so again on a new
  // phone. The push subscription itself is device-bound and stays behind — the
  // new device registers its own and sends these prefs up with it.
  np: 'wl_push_prefs',

  // ── Subscriptions the user opted into ────────────────────────────────────
  we: 'wl_weekly_email',
  bs: 'wl_backup_sub',

  // ── Portfolio Guardian ───────────────────────────────────────────────────
  // Including these means restoring a backup on a new device recovers the SAME
  // Guardian registration, so a lost phone doesn't leave the dead-man's switch
  // stranded (it can be reset/cancelled again).
  gd: 'wl_guardian',
  gi: 'wl_guardian_device_id',
}

// The transactions, wallets and their id counters travel in dedicated payload
// slots rather than the alias table, because the v3 format compacts them.
const CORE_KEYS = [
  'crypto_tracker_transactions',
  'crypto_tracker_wallets',
  'crypto_tracker_next_tx_id',
  'crypto_tracker_next_wallet_id',
  'crypto_tracker_next_ex_id',
]

/** Every key a restore may write. Also the allowlist for legacy WL1/WL2 codes. */
export const BACKUP_KEYS = [...CORE_KEYS, ...Object.values(BACKUP_FIELDS)]

// Deliberately excluded, with the reason. Kept as a list rather than a comment
// so it can be asserted against in tests: a new key must be classified one way
// or the other, not forgotten.
export const DEVICE_ONLY_KEYS = [
  // A WebAuthn credential is bound to the device that created it. Restoring it
  // elsewhere gives a credential that cannot authenticate, and restoring the
  // "enabled" flag without a usable credential can lock someone out of their
  // own portfolio. Both stay put; the new device enrolls its own.
  'wl_biometric_cred',
  'wl_biometric_enabled',
  'wl_biometric_unlocked',
  // Operator secret, never user data.
  'wl_admin_mail_token',
  // Rollback buffer for the last import. Restoring it would offer to undo an
  // import that happened on a different device.
  'crypto_tracker_pre_import_snapshot',
  // UI, session and scheduling state. Harmless to lose, noise to carry.
  'wl_active_tab', 'wl_assistant_fab_pos', 'wl_assistant_history',
  'wl_tour_done_v2', 'wl_vision_explained', 'wl_vision_visited',
  'wl_last_visit', 'wl_streak', 'wl_engagement_ts', 'wl_daily_notif_date',
  'wl_guessr_hs', 'wl_sfx_enabled', 'wl_chunk_retry',
  'wl_target_reached_fired', 'wl_portfolio_notify_ts', 'wl_guardian_remind_ts',
  // Market Pulse. Sound preferences follow wl_sfx_enabled and stay with the
  // device — volume and haptics are properties of the phone, not the
  // portfolio. The rest is derived state that rebuilds itself correctly on
  // first refresh: wl_pulse_state re-seeds from the current value (which is
  // the point of seedRecords — carrying an old high-water mark across would
  // announce a stale all-time high), and the snapshot and missed-event
  // records are transient by construction.
  'wl_pulse_settings', 'wl_pulse_state', 'wl_pulse_missed', 'wl_pulse_samples',
  // Marks THIS install as running inside the Android app. Carrying it to a
  // browser would make the site think it was the app.
  'wl_native',
  // Push bookkeeping tied to this device's own subscription: the cached ticker
  // list last sent to the push server, and when it was last told the app was
  // opened. Both are re-derived on the new device's first dashboard load, and
  // carrying the heartbeat across would tell the server a device it has never
  // heard from was recently active.
  'wl_push_watch', 'wl_push_seen_ts',
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

  for (const [alias, key] of Object.entries(BACKUP_FIELDS)) {
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
    let restored = 2
    for (const [alias, key] of Object.entries(BACKUP_FIELDS)) {
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
