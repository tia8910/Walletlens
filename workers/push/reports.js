// "Report an issue" for AI answers in the app.
//
// Store policy asks that anything a model writes can be flagged by the person
// reading it and that a human reviews what is flagged. The app posts the
// answer, a reason and an optional note here; /admin/reports on the site
// reads them back with REPORTS_TOKEN.
//
// No portfolio, no identity. The address a report came from is kept only as a
// salted hash, and only to stop one source flooding the table.

export const REASONS = new Set(['inaccurate', 'harmful', 'risky', 'other'])
const MAX_BODY = 8192
const PER_HOUR = 20

const clip = (v, n) => String(v ?? '').slice(0, n)

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
    if (raw.length > MAX_BODY) return json({ error: 'too_large' }, headers, 413)
    let body = null
    try { body = JSON.parse(raw) } catch { /* fall through */ }
    const report = parseReport(body)
    if (!report) return json({ error: 'invalid' }, headers, 400)

    const src = await sourceHash(req)
    const since = Date.now() - 3600_000
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM ai_reports WHERE src = ? AND at > ?').bind(src, since).first()
    if ((recent?.n || 0) >= PER_HOUR) return json({ error: 'rate_limited' }, headers, 429)

    await env.DB.prepare(
      'INSERT INTO ai_reports (at, surface, reason, note, output, lang, src, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(Date.now(), report.surface, report.reason, report.note, report.output, report.lang, src, 'new').run()
    return json({ ok: true }, headers)
  }

  if (path === '/reports' || path === '/reports/review') {
    if (!env.REPORTS_TOKEN) return json({ error: 'not_configured' }, headers, 503)
    if (!authorized(req, env)) return json({ error: 'unauthorized' }, headers, 401)

    if (req.method === 'GET' && path === '/reports') {
      const { results } = await env.DB.prepare(
        'SELECT id, at, surface, reason, note, output, lang, status FROM ai_reports ORDER BY at DESC LIMIT 200',
      ).all()
      return json({ ok: true, reports: results || [] }, headers)
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
