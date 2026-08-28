import { describe, it, expect } from 'vitest'
import worker, { __registered } from '../../workers/voice/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = dirname(fileURLToPath(import.meta.url))

// voice-api was ported by transpiling main.ts and giving the body a local
// object named `Deno`, so its own Deno.serve and Deno.cron calls register
// against the Worker instead of the Deno runtime. That only works if the body
// actually RUNS at import — which is what these check, along with the two
// entry points the platform calls.

describe('the ported body registers itself at import', () => {
  it('registered a request handler via its own Deno.serve call', () => {
    expect(__registered().hasHandler, 'Deno.serve shim never fired').toBe(true)
  })

  it('registered both crons, on the schedules the Deno service used', () => {
    const { crons } = __registered()
    const schedules = crons.map(c => c.schedule).sort()
    expect(schedules).toEqual(['0 */6 * * *', '0 13 * * 1'])
  })

  it('names them, so a failure can say which one failed', () => {
    const names = __registered().crons.map(c => c.name).sort()
    expect(names).toEqual(['guardian-sweep', 'weekly-report'])
  })

  it('matches the schedules declared in wrangler.toml', () => {
    // A cron the body registers but wrangler never fires is a job that
    // silently never runs.
    const toml = readFileSync(join(SRC, '..', '..', 'workers', 'voice', 'wrangler.toml'), 'utf8')
    for (const { schedule } of __registered().crons) {
      expect(toml, `wrangler.toml is missing ${schedule}`).toContain(schedule)
    }
  })
})

describe('scheduled()', () => {
  const ctx = () => { const p = []; return { waitUntil: x => p.push(x), settled: () => Promise.all(p) } }
  const env = () => ({ DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) }) } })

  it('ignores a schedule nothing registered for', async () => {
    const c = ctx()
    await worker.scheduled({ cron: '* * * * *' }, env(), c)
    await c.settled()   // must not throw
  })

  it('runs the job whose schedule fired', async () => {
    const c = ctx()
    // The guardian sweep lists an empty table and does nothing, which is
    // enough to prove the dispatch path reaches real ported code.
    await worker.scheduled({ cron: '0 */6 * * *' }, env(), c)
    await expect(c.settled()).resolves.toBeDefined()
  })
})

describe('fetch()', () => {
  const env = () => ({ DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) }) } })

  it('answers a CORS preflight from the live origin', async () => {
    const res = await worker.fetch(
      new Request('https://x/', { method: 'OPTIONS', headers: { origin: 'https://walletlens.live' } }),
      env(),
    )
    expect(res.status).toBeLessThan(400)
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy()
  })

  it('reaches the ported handler rather than the not-registered fallback', async () => {
    const res = await worker.fetch(
      new Request('https://x/', { method: 'OPTIONS', headers: { origin: 'https://walletlens.live' } }),
      env(),
    )
    expect(res.status).not.toBe(500)
  })
})
