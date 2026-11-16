import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assistantErrorCode } from './assistantAi'

// The assistant said "Could not reach the assistant" for every failure, and
// its panel let the page show through.
const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

describe('the assistant when an answer does not come', () => {
  it('names what went wrong', () => {
    expect(assistantErrorCode(429)).toBe('busy')
    expect(assistantErrorCode(503)).toBe('unavailable')
    expect(assistantErrorCode(502)).toBe('upstream')
    expect(assistantErrorCode(500)).toBe('failed')
    const chat = read('components/AssistantChat.jsx')
    for (const k of ['offline', 'network', 'busy', 'upstream', 'unavailable', 'failed']) expect(chat).toMatch(new RegExp(`\\n  ${k}: \\[`))
  })
  it('offers to try again without asking the question twice', () => {
    const chat = read('components/AssistantChat.jsx')
    expect(chat).toMatch(/if \(retry\) return ask\(messages\)/)
    expect(chat).toMatch(/send\(messages\[messages\.length - 1\]\.text, \{ retry: true \}\)/)
  })
  it('keeps the panel opaque on every theme', () => {
    expect(read('index.css')).toMatch(/\.wlc-panel \{[^}]*background: linear-gradient\(var\(--card-bg, #0d1117\), var\(--card-bg, #0d1117\)\), #0d1117;/)
  })
})
