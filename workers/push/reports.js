// "Report an issue" for AI answers in the app.
//
// Store policy asks that anything a model writes can be flagged by the person
// reading it and that a human reviews what is flagged. The app posts the
// answer, a reason and an optional note here; /admin/reports on the site
// reads them back with REPORTS_TOKEN.
//
// No portfolio, no identity. The address a report came from is kept only as a
// salted hash, and only to stop one source flooding the table.

export const REASONS = new Set(['feedback', 'inaccurate', 'harmful', 'risky', 'other'])
const MAX_BODY = 8192
const PER_HOUR = 20
// A screenshot may come with a report, shrunk by the app to a JPEG of at most
// 1280px, so a data URL well under this. D1 allows 2 MB a row.
export const MAX_SHOT = 700_000
const SHOT_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/

const clip = (v, n) => String(v ?? '').slice(0, n)

// Every new report is also emailed to the team, so nothing waits for someone
// to open /admin/reports. Sent through Resend (the voice worker's mail
// service) when RESEND_API_KEY is set; without it the report is still kept.
export const REPORT_TO = 'contact@walletlens.live'
const REPORT_FROM = 'WalletLens Reports <noreply@walletlens.live>'
const ADMIN_URL = 'https://walletlens.live/admin/reports'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** The email for one report: subject, html, and the screenshot as an attachment. */
export function reportEmail(report, id, shot) {
  const what = report.reason === 'feedback' ? 'Feedback' : `AI answer flagged: ${report.reason}`
  const subject = `[WalletLens] ${what} · ${report.surface}${id ? ` · #${id}` : ''}`
  const row = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#55635c;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>` : ''
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#0f1a15;max-width:640px">
<h2 style="margin:0 0 12px;font-size:18px">${esc(what)}</h2>
<table style="border-collapse:collapse;margin-bottom:12px">${row('Report', id ? `#${id}` : '')}${row('Where', report.surface)}${row('Reason', report.reason)}${row('Language', report.lang)}${row('Screenshot', shot ? 'attached' : '')}</table>
${report.note ? `<p style="margin:0 0 6px;font-weight:700">Their note</p><blockquote style="margin:0 0 14px;padding:10px 12px;border-left:3px solid #10b981;background:#f1f7f4;white-space:pre-wrap">${esc(report.note)}</blockquote>` : ''}
<p style="margin:0 0 6px;font-weight:700">${report.reason === 'feedback' ? 'Details' : 'The answer they flagged'}</p>
<pre style="margin:0 0 16px;padding:10px 12px;background:#f4f6f5;border-radius:8px;white-space:pre-wrap;font-family:inherit">${esc(report.output)}</pre>
<p style="margin:0"><a href="${ADMIN_URL}" style="color:#047857;font-weight:700">Open the reports page</a> to read it and mark it reviewed.</p>
<p style="margin:12px 0 0;color:#55635c;font-size:12px">No identity or portfolio is sent with a report.</p>
</div>`
  const attachments = []
  const m = typeof shot === 'string' ? /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(shot) : null
  if (m) attachments.push({ filename: `report-${id || 'shot'}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`, content: m[2] })
  return { subject, html, attachments }
}

/** Email a new report to the team. Never throws: the report is already kept. */
export async function emailReport(env, report, id, shot, fetchImpl = fetch) {
  const key = env.RESEND_API_KEY
  if (!key) return false
  try {
    const { subject, html, attachments } = reportEmail(report, id, shot)
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: REPORT_FROM, to: [REPORT_TO], subject, html, ...(attachments.length ? { attachments } : {}) }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.warn('report email failed:', res.status)
    return res.ok
  } catch (e) {
    console.warn('report email failed:', String(e?.message || e).slice(0, 200))
    return false
  }
}

export function parseReport(body) {
  if (!body || typeof body !== 'object') return null
  const output = clip(body.output, 4000).trim()
  if (!output) return null
  return {
    surface: clip(body.surface, 40) || 'unknown',
    reason: REASONS.has(body.reason) ? body.reason : 'other',
    note: clip(body.note, 1000),
    output,
    lang: clip(body.lang, 8),
  }
}

/** The screenshot sent with a report: an image data URL in bounds, else null. */
export function parseShot(v) {
  if (typeof v !== 'string' || !v || v.length > MAX_SHOT) return null
  return SHOT_RE.test(v) ? v : null
}

// Screenshots live in their own table, created here on first use: the deploy
// applies schema.sql only when asked, and a missing table must not lose a
// report. Once per isolate.
let shotsReady = null
function ensureShots(env) {
  if (!shotsReady) {
    shotsReady = Promise.resolve(env.DB.prepare('CREATE TABLE IF NOT EXISTS ai_report_shots (report_id INTEGER PRIMARY KEY, shot TEXT NOT NULL)').run())
      .catch((e) => { shotsReady = null; throw e })
  }
  return shotsReady
}

async function sourceHash(req) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown'
  const day = new Date().toISOString().slice(0, 10)
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ai-report:${day}:${ip}`))
  return [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('')
}

function authorized(req, env) {
  const token = env.REPORTS_TOKEN
  if (!token) return false
  return req.headers.get('authorization') === `Bearer ${token}`
}

/** Returns a Response for the report routes, or null for any other path. */
export async function handleReports(req, path, env, json, headers) {
  if (req.method === 'POST' && path === '/report') {
    const raw = await req.text()
    if (raw.length > MAX_BODY + MAX_SHOT) return json({ error: 'too_large' }, headers, 413)
    let body = null
    try { body = JSON.parse(raw) } catch { /* fall through */ }
    // The report itself keeps its small limit; only a screenshot may add to it.
    const shotLen = typeof body?.shot === 'string' ? body.shot.length : 0
    if (raw.length - shotLen > MAX_BODY) return json({ error: 'too_large' }, headers, 413)
    const report = parseReport(body)
    if (!report) return json({ error: 'invalid' }, headers, 400)
    const shot = parseShot(body.shot)

    const src = await sourceHash(req)
    const since = Date.now() - 3600_000
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM ai_reports WHERE src = ? AND at > ?').bind(src, since).first()
    if ((recent?.n || 0) >= PER_HOUR) return json({ error: 'rate_limited' }, headers, 429)

    const ins = await env.DB.prepare(
      'INSERT INTO ai_reports (at, surface, reason, note, output, lang, src, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(Date.now(), report.surface, report.reason, report.note, report.output, report.lang, src, 'new').run()
    const id = ins?.meta?.last_row_id
    let shotSaved = false
    if (shot && id) {
      // The report is already kept; a screenshot that fails to save does not
      // undo it, and the answer says so.
      try {
        await ensureShots(env)
        await env.DB.prepare('INSERT INTO ai_report_shots (report_id, shot) VALUES (?, ?)').bind(id, shot).run()
        shotSaved = true
      } catch { /* report kept without it */ }
    }
    // Tell the team straight away. A failed email loses nothing: the report
    // is in the table and on /admin/reports either way.
    const emailed = await emailReport(env, report, id, shot)
    return json({ ok: true, shot: shotSaved, emailed }, headers)
  }

  if (path === '/reports' || path === '/reports/review' || path === '/reports/shot') {
    if (!env.REPORTS_TOKEN) return json({ error: 'not_configured' }, headers, 503)
    if (!authorized(req, env)) return json({ error: 'unauthorized' }, headers, 401)

    if (req.method === 'GET' && path === '/reports') {
      // Which reports have a screenshot, not the images: those load one at a
      // time from /reports/shot, so the list stays light.
      let withShot = new Set()
      try {
        await ensureShots(env)
        const s = await env.DB.prepare('SELECT report_id FROM ai_report_shots').all()
        withShot = new Set((s?.results || []).map(r => r.report_id))
      } catch { /* no screenshots yet */ }
      const { results } = await env.DB.prepare(
        'SELECT id, at, surface, reason, note, output, lang, status FROM ai_reports ORDER BY at DESC LIMIT 200',
      ).all()
      return json({ ok: true, reports: (results || []).map(r => ({ ...r, has_shot: withShot.has(r.id) })) }, headers)
    }
    if (req.method === 'GET' && path === '/reports/shot') {
      const id = Number(new URL(req.url).searchParams.get('id'))
      if (!Number.isInteger(id)) return json({ error: 'invalid' }, headers, 400)
      await ensureShots(env)
      const row = await env.DB.prepare('SELECT shot FROM ai_report_shots WHERE report_id = ?').bind(id).first()
      if (!row?.shot) return json({ error: 'not_found' }, headers, 404)
      return json({ ok: true, shot: row.shot }, headers)
    }
    if (req.method === 'POST' && path === '/reports/review') {
      let body = {}
      try { body = await req.json() } catch { /* empty */ }
      const id = Number(body.id)
      const status = body.status === 'new' ? 'new' : 'reviewed'
      if (!Number.isInteger(id)) return json({ error: 'invalid' }, headers, 400)
      await env.DB.prepare('UPDATE ai_reports SET status = ? WHERE id = ?').bind(status, id).run()
      return json({ ok: true }, headers)
    }
  }
  return null
}
