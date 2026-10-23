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

  it('records the page it was sent from', () => {
    const r = feedbackReport({ topic: 'ai', message: 'x', page: '/coach', where: 'web' })
    expect(r.surface).toBe('feedback:ai')
    expect(r.note).toBe('platform: web\npage: /coach')
  })

  it('files an unknown topic under other', () => {
    expect(feedbackReport({ topic: 'nope', message: 'x', where: 'web' }).surface).toBe('feedback:other')
    expect(TOPICS).toEqual(['idea', 'bug', 'price', 'ai', 'other'])
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

describe('the Home rate card', () => {
  const card = read('components/RateCard.jsx')
  it('offers Report a problem beside Rate, opening the feedback sheet on bugs', () => {
    expect(card).toMatch(/className="nl-rate-go"/)
    expect(card).toMatch(/<FeedbackSheet initialTopic="bug"/)
  })
  it('does not put the report in front of the rating', () => {
    // Rate goes straight to the review flow; reporting neither hides nor
    // snoozes the card.
    const rate = card.slice(card.indexOf('const rate = () =>'), card.indexOf('const later'))
    expect(rate).toMatch(/requestReviewNow\('home_card'\)/)
    expect(rate).not.toMatch(/FeedbackSheet|setReport/)
  })
})
