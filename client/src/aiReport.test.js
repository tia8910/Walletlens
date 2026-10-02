import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseReport, handleReports } from '../../workers/push/reports.js'
import { buildReport, mailtoFor, REPORT_ENDPOINT } from './components/AiReport.jsx'
import { isZakatOn, setZakatOn } from './zakatSwitch'

// Store policy: generative output must be reportable by the person reading
// it, and reports must reach a human. These pin the pieces that make that true.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')
const json = (obj, headers, status = 200) => new Response(JSON.stringify(obj), { status, headers })

function fakeDb() {
  const rows = []
  return {
    rows,
    prepare(sql) {
      let args = []
      return {
        bind(...a) { args = a; return this },
        async first() { return { n: rows.filter(r => r.src === args[0] && r.at > args[1]).length } },
        async run() {
          if (sql.startsWith('INSERT')) { const [at, surface, reason, note, output, lang, src, status] = args; rows.push({ id: rows.length + 1, at, surface, reason, note, output, lang, src, status }) }
          if (sql.startsWith('UPDATE')) { const r = rows.find(x => x.id === args[1]); if (r) r.status = args[0] }
        },
        async all() { return { results: [...rows].reverse() } },
      }
    },
  }
}
const post = (path, body, init = {}) => new Request(`https://walletlens.live/api/push${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'cf-connecting-ip': '1.2.3.4', ...(init.headers || {}) } })

describe('the report server', () => {
  it('accepts a report, keeps only the known fields, and clips them', () => {
    const r = parseReport({ surface: 'assistant', reason: 'harmful', note: 'x'.repeat(5000), output: 'answer', portfolio: [1, 2] })
    expect(r).toEqual({ surface: 'assistant', reason: 'harmful', note: 'x'.repeat(1000), output: 'answer', lang: '' })
    expect(parseReport({ output: '  ' })).toBeNull()
    expect(parseReport({ output: 'a', reason: 'nonsense' }).reason).toBe('other')
  })

  it('stores a report and rate-limits one source', async () => {
    const env = { DB: fakeDb() }
    const res = await handleReports(post('/report', { surface: 'decision', reason: 'risky', output: 'Sell everything' }), '/report', env, json, {})
    expect(res.status).toBe(200)
    expect(env.DB.rows[0]).toMatchObject({ surface: 'decision', reason: 'risky', output: 'Sell everything', status: 'new' })
    expect(env.DB.rows[0].src).toMatch(/^[0-9a-f]{24}$/)
    for (let i = 0; i < 19; i++) await handleReports(post('/report', { output: 'a' }), '/report', env, json, {})
    const limited = await handleReports(post('/report', { output: 'a' }), '/report', env, json, {})
    expect(limited.status).toBe(429)
  })

  it('refuses bad bodies', async () => {
    const env = { DB: fakeDb() }
    expect((await handleReports(post('/report', 'not json'), '/report', env, json, {})).status).toBe(400)
    expect((await handleReports(post('/report', { output: 'x'.repeat(9000) }), '/report', env, json, {})).status).toBe(413)
  })

  it('shows reports only to the reviewer token', async () => {
    const env = { DB: fakeDb(), REPORTS_TOKEN: 'secret' }
    await handleReports(post('/report', { output: 'a' }), '/report', env, json, {})
    const get = (auth) => new Request('https://walletlens.live/api/push/reports', { headers: auth ? { authorization: auth } : {} })
    expect((await handleReports(get(), '/reports', env, json, {})).status).toBe(401)
    const ok = await handleReports(get('Bearer secret'), '/reports', env, json, {})
    expect((await ok.json()).reports).toHaveLength(1)
    expect((await handleReports(get('Bearer secret'), '/reports', { DB: fakeDb() }, json, {})).status).toBe(503)
  })

  it('is wired into the worker and its schema', () => {
    expect(read('../../workers/push/index.js')).toMatch(/const report = await handleReports\(req, path, env, json, headers\)/)
    expect(read('../../workers/push/schema.sql')).toMatch(/CREATE TABLE IF NOT EXISTS ai_reports/)
  })
})

describe('the Report button in the app', () => {
  it('posts to the push worker route and falls back to email', () => {
    expect(REPORT_ENDPOINT).toBe('/api/push/report')
    const r = buildReport({ surface: 'assistant', reason: 'harmful', note: 'n', output: 'answer', lang: 'ar' })
    expect(mailtoFor(r)).toMatch(/^mailto:contact@walletlens\.live\?subject=/)
  })

  it('sits under every answer a model writes', () => {
    expect(read('components/AssistantChat.jsx')).toMatch(/<AiReport surface="assistant"/)
    expect(read('components/AIDecisionEngine.jsx')).toMatch(/result\.source === 'ai' && <AiReport surface="decision"/)
    expect(read('components/GrowthPlan.jsx')).toMatch(/<AiReport surface="growth_plan"/)
    expect(read('components/SmartImport.jsx')).toMatch(/<AiReport surface="screenshot_import"/)
    expect(read('components/VoiceImport.jsx')).toMatch(/<AiReport surface="voice_import"/)
  })

  it('has an admin page to review reports', () => {
    expect(read('App.jsx')).toMatch(/<Route path="\/admin\/reports" element=\{<AdminReports \/>\} \/>/)
  })
})

describe('zakat is opt-in', () => {
  beforeEach(() => localStorage.clear())

  it('is off for someone who never used it, on for someone who did', () => {
    expect(isZakatOn()).toBe(false)
    localStorage.setItem('wl_zakat_hawl', '{"start":"2026-01-01"}')
    expect(isZakatOn()).toBe(true)
  })

  it('follows an explicit choice either way', () => {
    localStorage.setItem('wl_zakat_hawl', '{}')
    setZakatOn(false)
    expect(isZakatOn()).toBe(false)
    setZakatOn(true)
    localStorage.removeItem('wl_zakat_hawl')
    expect(isZakatOn()).toBe(true)
  })

  it('hides every menu entry behind the switch and gates the tab', () => {
    const app = read('App.jsx')
    expect(app).toMatch(/\{zakatOn && \(\n\s+<button className="wl-drawer-item" onClick=\{\(\) => go\('\/dashboard', \{ tab: 'zakat' \}\)\}>/)
    expect(app).toMatch(/\{zakatOn && <Row icon=\{V2_ICONS\.zakat\}/)
    expect(read('pages/Dashboard.jsx')).toMatch(/<ZakatGate><ZakatCalculator/)
    expect(read('pages/Settings.jsx')).toMatch(/<ZakatSettings \/>/)
  })
})

describe('feedback from the top bar', () => {
  it('offers feedback first there, and the server keeps it as feedback', async () => {
    const src = readFileSync(join(here, 'components/AiReport.jsx'), 'utf8')
    expect(src).toMatch(/\(general \? REASONS : AI_REASONS\)\.map/)
    expect(src).toMatch(/useState\(general \? 'feedback' : 'inaccurate'\)/)
    expect(parseReport({ output: 'Reported from /dashboard', reason: 'feedback' }).reason).toBe('feedback')
  })
})
