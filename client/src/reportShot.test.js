import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleReports, parseShot, MAX_SHOT } from '../../workers/push/reports.js'
import { fitSize, MAX_SIDE, MAX_SHOT_CHARS } from './shrinkShot'

// A screenshot can come with a feedback report and be seen on /admin/reports.
const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')
const json = (obj, headers, status = 200) => new Response(JSON.stringify(obj), { status, headers })

function db() {
  const reports = [], shots = new Map()
  return {
    reports, shots,
    prepare(sql) {
      let args = []
      return {
        bind(...a) { args = a; return this },
        async first() {
          if (sql.includes('FROM ai_report_shots')) return shots.has(args[0]) ? { shot: shots.get(args[0]) } : null
          return { n: 0 }
        },
        async run() {
          if (sql.startsWith('INSERT INTO ai_reports')) { reports.push({ id: reports.length + 1, at: args[0], output: args[4], status: 'new' }); return { meta: { last_row_id: reports.length } } }
          if (sql.startsWith('INSERT INTO ai_report_shots')) shots.set(args[0], args[1])
          return { meta: {} }
        },
        async all() {
          if (sql.includes('FROM ai_report_shots')) return { results: [...shots.keys()].map(report_id => ({ report_id })) }
          return { results: [...reports].reverse() }
        },
      }
    },
  }
}
const post = (body) => new Request('https://walletlens.live/api/push/report', { method: 'POST', body: JSON.stringify(body), headers: { 'cf-connecting-ip': '9.9.9.9' } })
const get = (url) => new Request(url, { headers: { authorization: 'Bearer secret' } })
const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(20000)

describe('a screenshot with a report', () => {
  it('accepts only an image data URL within the limit', () => {
    expect(parseShot(IMG)).toBe(IMG)
    expect(parseShot('data:text/html;base64,PHNjcmlwdD4=')).toBeNull()
    expect(parseShot('javascript:alert(1)')).toBeNull()
    expect(parseShot('data:image/jpeg;base64,' + 'A'.repeat(MAX_SHOT))).toBeNull()
    expect(parseShot(42)).toBeNull()
  })

  it('stores it beside the report, and the reviewer sees it on request', async () => {
    const env = { DB: db(), REPORTS_TOKEN: 'secret' }
    const res = await handleReports(post({ surface: 'feedback:bug', reason: 'feedback', output: 'Cannot see my text', shot: IMG }), '/report', env, json, {})
    expect(await res.json()).toEqual({ ok: true, shot: true, emailed: false })
    const list = await (await handleReports(get('https://walletlens.live/api/push/reports'), '/reports', env, json, {})).json()
    expect(list.reports[0]).toMatchObject({ id: 1, has_shot: true })
    expect(list.reports[0].shot).toBeUndefined()
    const one = await (await handleReports(get('https://walletlens.live/api/push/reports/shot?id=1'), '/reports/shot', env, json, {})).json()
    expect(one.shot).toBe(IMG)
    const none = await handleReports(new Request('https://walletlens.live/api/push/reports/shot?id=1'), '/reports/shot', env, json, {})
    expect(none.status).toBe(401)
  })

  it('keeps the report small: only a screenshot may make the body larger', async () => {
    const env = { DB: db() }
    expect((await handleReports(post({ output: 'x'.repeat(9000), shot: IMG }), '/report', env, json, {})).status).toBe(413)
    const bad = await handleReports(post({ output: 'ok', shot: 'data:text/html;base64,AAAA' }), '/report', env, json, {})
    expect(await bad.json()).toEqual({ ok: true, shot: false, emailed: false })
  })

  it('is shrunk on the device to fit', () => {
    expect(fitSize(1080, 2400)).toEqual({ w: 576, h: MAX_SIDE })
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 })
    expect(fitSize(0, 10)).toBeNull()
    expect(MAX_SHOT_CHARS).toBeLessThan(MAX_SHOT)
  })

  it('is offered in Send feedback, with a privacy note, and shown on the admin page', () => {
    const fb = read('components/FeedbackSheet.jsx')
    expect(fb).toMatch(/accept="image\/\*"/)
    expect(fb).toMatch(/shot \? \{ \.\.\.report, shot \} : report/)
    expect(fb).toMatch(/if \(shot && r\.status === 413\) r = await post\(report, 8000\)/)
    expect(fb).toMatch(/shot \? t\('fbShotPrivacy'\) : t\('fbPrivacy'\)/)
    expect(read('pages/AdminReports.jsx')).toMatch(/\$\{ENDPOINT\}\/shot\?id=\$\{id\}/)
    expect(read('../../workers/push/schema.sql')).toMatch(/CREATE TABLE IF NOT EXISTS ai_report_shots/)
  })
})
