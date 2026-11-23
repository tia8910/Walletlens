import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reportEmail, emailReport, REPORT_TO } from '../../workers/push/reports.js'

// Every new report (a flagged AI answer, or feedback such as a bug report) is
// emailed to contact@walletlens.live, so nothing waits for someone to open
// /admin/reports.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const report = { surface: 'feedback:bug', reason: 'feedback', note: 'platform: android page: /dashboard/', output: 'Other <real estate> shows as crypto', lang: 'en' }
const SHOT = 'data:image/jpeg;base64,AAAA'

describe('the report email', () => {
  it('goes to contact@walletlens.live', () => {
    expect(REPORT_TO).toBe('contact@walletlens.live')
  })

  it('says what was reported, where, with their note, and escapes it', () => {
    const { subject, html } = reportEmail(report, 31, null)
    expect(subject).toBe('[WalletLens] Feedback · feedback:bug · #31')
    expect(html).toContain('platform: android page: /dashboard/')
    expect(html).toContain('Other &lt;real estate&gt; shows as crypto')
    expect(html).not.toContain('<real estate>')
    expect(html).toContain('https://walletlens.live/admin/reports')
    expect(reportEmail({ ...report, reason: 'harmful' }, 2, null).subject).toContain('AI answer flagged: harmful')
  })

  it('attaches the screenshot', () => {
    const { attachments, html } = reportEmail(report, 31, SHOT)
    expect(attachments).toEqual([{ filename: 'report-31.jpg', content: 'AAAA' }])
    expect(html).toContain('attached')
  })

  it('is sent through Resend with the key, and never throws', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }))
    expect(await emailReport({ RESEND_API_KEY: 'k' }, report, 31, SHOT, fetchImpl)).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer k')
    const body = JSON.parse(init.body)
    expect(body.to).toEqual(['contact@walletlens.live'])
    expect(body.attachments).toHaveLength(1)
    expect(await emailReport({}, report, 1, null, fetchImpl)).toBe(false)
    expect(await emailReport({ RESEND_API_KEY: 'k' }, report, 1, null, async () => { throw new Error('down') })).toBe(false)
  })

  it('runs after every saved report, and the deploy gives the push worker the key', () => {
    expect(readFileSync(join(ROOT, 'workers/push/reports.js'), 'utf8')).toMatch(/const emailed = await emailReport\(env, report, id, shot\)/)
    const wf = readFileSync(join(ROOT, '.github/workflows/deploy-workers.yml'), 'utf8')
    expect(wf).toMatch(/printf '%s' "\$RESEND_API_KEY" \| npx --yes wrangler@4 secret put RESEND_API_KEY/)
  })
})
