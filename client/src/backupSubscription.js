// Weekly email-backup subscription. The portfolio lives only on the device, so
// the server can't regenerate it — the app itself regenerates the backup and
// emails it: once when you subscribe, then automatically whenever you open the
// app after ~7 days have passed.
import { generateBackupCode, makeQrDataUrl, QR_CHUNK } from './backupCore'

const SUB_KEY = 'wl_backup_sub'
const MAIL_ENDPOINT = 'https://walletlens-voice-parse.tia8910.deno.net/'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function loadBackupSub() {
  try { return JSON.parse(localStorage.getItem(SUB_KEY) || 'null') } catch { return null }
}
function saveBackupSub(s) {
  try { localStorage.setItem(SUB_KEY, JSON.stringify(s)) } catch {}
}
export function clearBackupSub() {
  try { localStorage.removeItem(SUB_KEY) } catch {}
}

function hasSomethingToBackUp() {
  try {
    const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions') || '[]')
    return Array.isArray(txs) && txs.length > 0
  } catch { return false }
}

// Generate the current backup and email it via the server (noreply@walletlens.live).
// Throws an Error (with .reason) on failure so callers can surface it.
export async function sendBackupEmail(email) {
  const { code } = await generateBackupCode()
  // Attach a single scannable QR when the code fits one; the full code is always
  // included in the email body so restore works regardless.
  let qrPng = null
  if (code.length <= QR_CHUNK) {
    const dataUrl = await makeQrDataUrl(code)
    const b64 = (dataUrl || '').split(',')[1] || ''
    if (b64 && b64.length < 45000) qrPng = b64
  }
  const res = await fetch(MAIL_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'backup_email', email, code, qrPng }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    const reason = String(data.reason || data.error || 'send_failed')
    const err = new Error(reason); err.reason = reason; throw err
  }
  return true
}

// Subscribe: send immediately and persist so the weekly auto-send can run.
export async function subscribeBackupEmail(email) {
  const clean = String(email || '').trim().toLowerCase()
  await sendBackupEmail(clean)
  const now = new Date().toISOString()
  saveBackupSub({ email: clean, enabled: true, createdAt: now, lastSentAt: now })
  return loadBackupSub()
}

// Manual "send now" — resend and reset the weekly clock.
export async function resendBackupNow() {
  const sub = loadBackupSub()
  if (!sub?.email) return
  await sendBackupEmail(sub.email)
  saveBackupSub({ ...sub, lastSentAt: new Date().toISOString() })
}

export function daysUntilNextBackup() {
  const sub = loadBackupSub()
  if (!sub?.enabled || !sub.lastSentAt) return null
  const elapsed = Date.now() - new Date(sub.lastSentAt).getTime()
  return Math.max(0, Math.ceil((WEEK_MS - elapsed) / (24 * 60 * 60 * 1000)))
}

// Fired on app open. If subscribed and a week has elapsed (and there's data to
// back up), regenerate and resend silently. Failures are retried next open.
export async function maybeSendWeeklyBackup() {
  const sub = loadBackupSub()
  if (!sub?.enabled || !sub.email) return
  const last = sub.lastSentAt ? new Date(sub.lastSentAt).getTime() : 0
  if (Date.now() - last < WEEK_MS) return
  if (!hasSomethingToBackUp()) return
  try {
    await sendBackupEmail(sub.email)
    saveBackupSub({ ...sub, lastSentAt: new Date().toISOString() })
  } catch { /* try again on next open */ }
}
