import { useEffect, useState, useCallback } from 'react'
import {
  SITE_ORIGIN, DRIVE_API, PUSH_API, VOICE_HOST, DATA_HOST, DRIVE_AUTH_HOST,
} from '../apiHosts'

// Every backend hop, checked at once.
//
// WHY THIS EXISTS
//
// Five separate faults this month were one cause — workers.dev unreachable
// from the device — and they surfaced one per deploy, because each was only
// visible once the one in front of it was fixed. Every round cost a build, an
// upload and a screenshot to learn one bit of information.
//
// The instrument was the problem. A screenshot of one feature failing says
// which feature failed, and nothing about why or about the four hops behind
// it. So this page asks every question in one pass and prints the answers as
// text that can be copied rather than photographed.
//
// It is deliberately not linked from anywhere and not in the sitemap. It is a
// URL to be typed when something is wrong.

const PENDING = { state: 'run', detail: 'checking…' }

// An invalid bearer on purpose. Google answers 401, and that 401 is the whole
// point: receiving it proves the preflight passed and CORS works, which a
// rejected fetch cannot distinguish from the host being unreachable.
const FAKE_TOKEN = 'diagnostic-probe-not-a-real-token'

const ms = (t0) => `${Math.round(performance.now() - t0)}ms`

/** Resolves to a row rather than throwing: one failed check must not stop the rest. */
async function check(name, fn) {
  const t0 = performance.now()
  try {
    const r = await fn()
    return { name, ...r, ms: ms(t0) }
  } catch (e) {
    return { name, state: 'fail', detail: String(e?.message || e).slice(0, 120), ms: ms(t0) }
  }
}

/** A same-origin JSON endpoint: reached, and answering the shape we expect. */
const json = (url, want) => async () => {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  const body = await res.text()
  const ok = want ? want(res, body) : res.ok
  return {
    state: ok ? 'ok' : 'fail',
    detail: `${res.status} · ${body.slice(0, 60).replace(/\s+/g, ' ')}`,
  }
}

/**
 * Reachability, with CORS taken out of the question.
 *
 * no-cors makes the browser send the request and hand back an opaque response
 * without applying CORS at all, so this resolves if anything answered and
 * rejects only if nothing did. The response is never read; its opacity is the
 * signal.
 */
const reachable = (url) => async () => {
  await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(8000) })
  return { state: 'ok', detail: 'answered' }
}

function driveTokenState() {
  try {
    const raw = JSON.parse(localStorage.getItem('wl_drive_token') || 'null')
    const rt = !!localStorage.getItem('wl_drive_refresh')
    if (!raw?.token) return { state: rt ? 'warn' : 'fail', detail: `no access token · refresh token: ${rt}` }
    const left = Math.round((raw.expiry - Date.now()) / 60000)
    // Never the token itself. Its age and whether one exists is the entire
    // diagnostic value, and the token is a live credential.
    return {
      state: left > 0 ? 'ok' : 'warn',
      detail: `${left > 0 ? `valid ${left}m` : `expired ${-left}m ago`} · refresh token: ${rt}`,
    }
  } catch (e) {
    return { state: 'fail', detail: String(e?.message || e) }
  }
}

async function swState() {
  if (!('serviceWorker' in navigator)) return { state: 'warn', detail: 'unsupported' }
  const reg = await navigator.serviceWorker.getRegistration()
  const c = navigator.serviceWorker.controller
  return {
    state: c ? 'ok' : 'warn',
    detail: `${c ? 'controlling' : 'not controlling'} · ${reg ? (reg.waiting ? 'update waiting' : 'current') : 'not registered'}`,
  }
}

const CHECKS = [
  // The site's own functions. A 405 or an HTML body here means the zip
  // deployed without _worker.js and every /api path is a static asset.
  ['drive route', json(`${DRIVE_API}/__diag`, (r, b) => r.status === 404 && b.includes('not_found'))],
  ['push route', json(`${PUSH_API}/health`, (r) => r.status < 500)],
  ['news dataset', json(`${SITE_ORIGIN}/news.json`, (r, b) => r.ok && b.trim().startsWith('{'))],
  // count is the diagnostic: the picker showing a dash on 128 of 130 rows was
  // a sparse snapshot, and nothing on screen said so.
  // The live fallback, for the few tickers the snapshot cannot carry. It was
  // never checked here, so "prices not loading" could not be pinned to the
  // file or to the function without guessing.
  // Reports the upstream's own field names when nothing parsed. Those are
  // schema, not data, and they are what fixes the mapping — a check that only
  // said "fail" cost several rounds of "still no ticker" with no way to tell
  // an undeployed dataset from a mis-read one.
  ['smart money', async () => {
    const res = await fetch(`${SITE_ORIGIN}/smartmoney.json`, {
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    })
    const body = await res.text()
    // Parse FIRST, whatever the status. The dataset now answers 502 and 503
    // with a JSON body that says why — that body is the entire point of this
    // check, and returning early on !res.ok discarded it and printed "not
    // published", which is the one thing every failure has in common.
    let d = null
    try { d = JSON.parse(body) } catch { /* not json — reported below */ }
    if (d?.error === 'dataset_unavailable') {
      return { state: 'fail', detail: `not deployed · data worker said ${d.upstream ?? 'nothing'}` }
    }
    if (!res.ok) {
      return { state: 'fail', detail: `${res.status} · ${d?.error || body.slice(0, 40).replace(/\s+/g, ' ')}` }
    }
    if (!d) return { state: 'fail', detail: 'not json' }
    if ((d.flows || []).length) return { state: 'ok', detail: `${d.flows.length} flows · ${d.shape || ''}` }
    const g = d.diagnostic || {}
    return {
      state: 'fail',
      detail: `rows ${g.rows ?? 0} · tried ${(g.tried || []).join(' ') || '—'} · keys ${(g.sampleKeys || []).join(',') || '—'}`,
    }
  }],
  ['stocks live', json(`${SITE_ORIGIN}/api/stocks?symbols=AAPL`, (r, b) => {
    try { return r.ok && typeof JSON.parse(b)?.AAPL?.price === 'number' } catch { return false }
  })],
  ['stock snapshot', json(`${SITE_ORIGIN}/stock-prices.json`, (r, b) => {
    try { return r.ok && Object.keys(JSON.parse(b).prices || {}).length > 100 } catch { return false }
  })],

  // Google, the two ways that fail identically through fetch() alone.
  ['drive host reachable', reachable('https://www.googleapis.com/drive/v3/files?pageSize=1')],
  ['drive CORS', async () => {
    const res = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1', {
      headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
      signal: AbortSignal.timeout(8000),
    })
    // 401 is success here: the preflight passed and the response carried CORS
    // headers, so the browser let us read it. Only the token was refused.
    return { state: res.status === 401 ? 'ok' : 'warn', detail: `${res.status} (401 expected)` }
  }],
  ['drive token', async () => driveTokenState()],

  // The hosts the device could not resolve, checked directly so a future
  // block shows up here rather than as a broken feature three weeks later.
  ['workers.dev direct', reachable(`https://${DRIVE_AUTH_HOST}/`)],
  ['voice worker', reachable(`https://${VOICE_HOST}/`)],
  ['data worker', reachable(`https://${DATA_HOST}/`)],

  ['service worker', swState],
]

const COLOR = { ok: '#10b981', warn: '#f59e0b', fail: '#ef4444', run: '#64748b' }
const MARK = { ok: 'OK', warn: '??', fail: 'FAIL', run: '..' }

export default function Diagnostics() {
  const [rows, setRows] = useState(() => CHECKS.map(([name]) => ({ name, ...PENDING })))
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const run = useCallback(() => {
    setDone(false)
    setRows(CHECKS.map(([name]) => ({ name, ...PENDING })))
    // Each check writes its own row as it lands, so a slow one never hides the
    // nine that already answered.
    CHECKS.forEach(([name, fn], i) => {
      check(name, fn).then((row) => {
        setRows((prev) => { const next = prev.slice(); next[i] = row; return next })
      })
    })
    Promise.allSettled(CHECKS.map(([name, fn]) => check(name, fn))).then(() => setDone(true))
  }, [])

  useEffect(() => { run() }, [run])

  const build = typeof __WL_BUILD__ === 'string' ? __WL_BUILD__ : 'unknown'
  const report = [
    `build ${build}`,
    `ua ${navigator.userAgent}`,
    `online ${navigator.onLine}`,
    ...rows.map((r) => `${MARK[r.state]} ${r.name} — ${r.detail}${r.ms ? ` (${r.ms})` : ''}`),
  ].join('\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* no clipboard permission — the text is on screen to select */ }
  }

  return (
    <div className="page" style={{ padding: '1.25rem 1rem 3rem', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.15rem', margin: '0 0 0.25rem' }}>Connection diagnostics</h1>
      <p style={{ opacity: 0.7, fontSize: '0.85rem', margin: '0 0 1rem' }}>
        Build <strong>{build}</strong> · {done ? 'all checks finished' : 'running…'}
      </p>

      <div style={{ display: 'grid', gap: '0.4rem' }}>
        {rows.map((r) => (
          <div key={r.name} style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.6rem',
            alignItems: 'baseline', padding: '0.55rem 0.7rem',
            background: 'var(--surface-2, #111827)', borderRadius: 8,
            borderLeft: `3px solid ${COLOR[r.state]}`,
          }}>
            <span style={{
              color: COLOR[r.state], fontWeight: 700, fontSize: '0.7rem',
              fontFamily: 'ui-monospace, monospace', minWidth: '2.4rem',
            }}>{MARK[r.state]}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.name}</span>
              <span style={{
                display: 'block', opacity: 0.7, fontSize: '0.76rem',
                fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word',
              }}>{r.detail}{r.ms ? ` · ${r.ms}` : ''}</span>
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button className="settings-chip" onClick={run}>Run again</button>
        <button className="settings-chip" onClick={copy}>{copied ? 'Copied' : 'Copy report'}</button>
      </div>

      <p style={{ opacity: 0.55, fontSize: '0.74rem', marginTop: '1rem', lineHeight: 1.5 }}>
        Nothing here is sent anywhere. No token, holding or transaction is read or shown —
        only whether a credential exists and how old it is.
      </p>
    </div>
  )
}
