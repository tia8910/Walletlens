import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { feedbackReport, TOPICS } from './components/FeedbackSheet'

const SRC = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(SRC, p), 'utf8')

describe('feedbackReport', () => {
  it('sends the message as feedback, tagged with its topic', () => {
    const r = feedbackReport({ topic: 'price', message: '  BTC is off  ', email: '', lang: 'ar', where: 'android' })
    expect(r).toMatchObject({ surface: 'feedback:price', reason: 'feedback', output: 'BTC is off', lang: 'ar' })
    expect(r.note).toBe('platform: android')
  })

  it('adds the email only when one is given', () => {
    const r = feedbackReport({ topic: 'idea', message: 'x', email: ' me@example.com ', lang: 'en', where: 'web' })
    expect(r.note).toBe('platform: web\nreply to: me@example.com')
  })

  it('files an unknown topic under other', () => {
    expect(feedbackReport({ topic: 'nope', message: 'x', where: 'web' }).surface).toBe('feedback:other')
    expect(TOPICS).toEqual(['idea', 'bug', 'price', 'other'])
  })
})

describe('where feedback lives', () => {
  it('is opened from Settings, never from the review flow', () => {
    expect(read('pages/Settings.jsx')).toMatch(/<FeedbackSheet onClose=/)
    // Play forbids asking anything before the rating card.
    expect(read('reviewPrompt.js')).not.toMatch(/FeedbackSheet/)
  })

  it('counts a backup or a restore on the Backup page as a moment', () => {
    const src = read('pages/BackupView.jsx')
    expect(src.match(/noteMoment\('backup_saved'\)/g)).toHaveLength(2)
    expect(src).toMatch(/noteMoment\('import_success'\)/)
  })
})
