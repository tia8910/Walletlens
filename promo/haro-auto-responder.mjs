#!/usr/bin/env node
/**
 * WalletLens — HARO / Connectively Auto-Responder
 *
 * Monitors Gmail for Connectively/HARO query emails, identifies relevant
 * queries (portfolio tracking, net worth, crypto, investing tools), uses
 * Claude to draft a personalized response, and saves it to Gmail Drafts.
 *
 * ── Quick start ──────────────────────────────────────────────────────────────
 *
 *   npm install imapflow mailparser nodemailer @anthropic-ai/sdk
 *
 *   GMAIL_USER=you@gmail.com \
 *   GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx" \
 *   ANTHROPIC_API_KEY=sk-ant-... \
 *   SENDER_NAME="Your Name" \
 *   node promo/haro-auto-responder.mjs
 *
 * ── Flags ─────────────────────────────────────────────────────────────────────
 *   (none)          Check once, save matching queries as Gmail Drafts
 *   --auto-send     Send responses immediately instead of saving drafts
 *   --watch         Poll every 30 minutes (good for cron-free Termux use)
 *   --dry-run       Print what would be done without touching Gmail or sending
 *
 * ── Gmail App Password setup (required) ──────────────────────────────────────
 *   1. Enable 2FA: myaccount.google.com/security
 *   2. App Passwords: myaccount.google.com/apppasswords
 *      → Select app: Mail → Select device: Other → name it "HARO bot" → Create
 *   3. Copy the 16-char password (spaces included is fine)
 */

import Anthropic from '@anthropic-ai/sdk'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import { setTimeout as sleep } from 'timers/promises'

// ── Config ────────────────────────────────────────────────────────────────────

const GMAIL_USER         = process.env.GMAIL_USER         || ''
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || ''
const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY  || ''
const SENDER_NAME        = process.env.SENDER_NAME        || 'WalletLens'

const AUTO_SEND = process.argv.includes('--auto-send')
const WATCH     = process.argv.includes('--watch')
const DRY_RUN   = process.argv.includes('--dry-run')
const POLL_MS   = 30 * 60 * 1000  // 30 minutes

// Keywords that indicate a HARO query is relevant to WalletLens
const RELEVANT_KEYWORDS = [
  'portfolio tracker', 'portfolio tracking', 'net worth', 'net-worth',
  'crypto tracker', 'crypto portfolio', 'investment tracker', 'investment app',
  'personal finance app', 'personal finance tool', 'wealth tracker',
  'stock tracker', 'asset tracker', 'kubera', 'coinStats', 'empower',
  'personal capital', 'free finance', 'privacy finance', 'finance tool',
  'investing app', 'portfolio manager', 'wealth management app',
  'financial tracking', 'track investments', 'track portfolio',
  'track net worth', 'best app for', 'best tool for', 'recommend',
]

// HARO / Connectively sender domains
const HARO_SENDERS = [
  'helpareporter.com',
  'connectively.us',
  'cision.com',
  'haro.',
]

// ── WalletLens context for Claude ─────────────────────────────────────────────

const WALLETLENS_CONTEXT = `
You are responding to journalist queries on behalf of WalletLens (walletlens.live).

## About WalletLens
WalletLens is a 100% free, no-account net worth and portfolio tracker.

Key facts (use these precisely in responses):
- Cost: Free forever. No paid tier, no subscription, no credit card. Sustained by Google AdSense.
- Account: No sign-up, no email, no password. Open the app and start tracking immediately.
- Privacy: All portfolio data stored in browser localStorage on the user's device. Nothing sent to any server. No backend database.
- Assets covered: Crypto (10,000+ coins via CoinGecko), US stocks and ETFs, gold, silver, platinum, fiat currencies, cash, bonds.
- AI analysis: Portfolio health score, stress testing, sell plan generator, Fear & Greed gauge, risk analysis.
- Platform: Progressive Web App (PWA) — installable on iOS, Android, desktop. Works offline.
- Languages: English and Arabic (full RTL support).
- Open source: Client-side code on GitHub (github.com/tia8910/walletlens).

## vs competitors
- vs Kubera ($150/yr): Free, same asset classes, no account
- vs CoinStats/Delta: Free, covers stocks + metals + fiat too, no account
- vs Empower/Personal Capital: No bank/brokerage login required, data stays on device
- vs spreadsheets: Live prices, AI analysis, push alerts, voice import

## Founder contact
- Email: contact@walletlens.live
- Website: https://walletlens.live

## Response guidelines
- Be direct and quotable — journalists want sentences they can lift straight into articles
- Lead with the most relevant fact for their specific query
- Keep responses under 200 words
- Always end with: contact@walletlens.live and walletlens.live on their own lines
- Sound like a founder speaking, not a press release
- Never claim things that aren't true — only use the facts above
`.trim()

// ── Claude response drafting ──────────────────────────────────────────────────

let _anthropic = null
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  return _anthropic
}

async function draftResponse(query) {
  const client = getAnthropic()

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: [
      {
        type: 'text',
        text: WALLETLENS_CONTEXT,
        cache_control: { type: 'ephemeral' },  // cache the long context
      }
    ],
    messages: [
      {
        role: 'user',
        content: `Write a HARO response to this journalist query. Be concise (150-200 words max), direct, and quotable. Include specific WalletLens facts that directly answer their question.

JOURNALIST QUERY:
${query.text}

OUTLET: ${query.outlet || 'Unknown'}
CATEGORY: ${query.category || 'Finance/Technology'}

Write only the response body — no subject line, no "Dear editor", just the pitch text starting with the most relevant fact.`,
      }
    ],
  })

  return response.content[0].text.trim()
}

// ── HARO email parser ─────────────────────────────────────────────────────────

/**
 * Parse individual queries from a HARO/Connectively email body.
 * Returns array of { title, category, outlet, email, text, deadline }
 */
function parseHaroEmail(text) {
  const queries = []

  // Split on common HARO separators
  const sections = text.split(/\n-{3,}\n|\n={3,}\n|\n\*{3,}\n/)

  for (const section of sections) {
    const lines = section.split('\n').map(l => l.trim()).filter(Boolean)

    const q = {}

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (/^Name:/i.test(line))         q.title    = line.replace(/^Name:\s*/i, '').trim()
      if (/^Query:/i.test(line))        q.title    = q.title || line.replace(/^Query:\s*/i, '').trim()
      if (/^Category:/i.test(line))     q.category = line.replace(/^Category:\s*/i, '').trim()
      if (/^Email:/i.test(line))        q.email    = line.replace(/^Email:\s*/i, '').trim()
      if (/^Media Outlet:/i.test(line)) q.outlet   = line.replace(/^Media Outlet:\s*/i, '').trim()
      if (/^Deadline:/i.test(line))     q.deadline = line.replace(/^Deadline:\s*/i, '').trim()
    }

    // Full text of the section is the query body
    q.text = section.trim()

    // Only include sections that have enough content
    if (q.text.length > 50 && (q.title || q.email || q.text.includes('?'))) {
      queries.push(q)
    }
  }

  return queries
}

/**
 * Check if a query is relevant to WalletLens.
 */
function isRelevant(query) {
  const haystack = (query.text + ' ' + (query.title || '') + ' ' + (query.category || '')).toLowerCase()
  return RELEVANT_KEYWORDS.some(kw => haystack.includes(kw.toLowerCase()))
}

// ── Gmail IMAP ────────────────────────────────────────────────────────────────

function isHaroSender(from) {
  if (!from) return false
  return HARO_SENDERS.some(domain => from.toLowerCase().includes(domain))
}

async function fetchUnreadHaroEmails() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  })

  const emails = []

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    // Search for unread emails from HARO senders in last 7 days
    const since = new Date()
    since.setDate(since.getDate() - 7)

    const uids = await client.search({ seen: false, since })

    for await (const msg of client.fetch(uids, { source: true, envelope: true })) {
      const parsed = await simpleParser(msg.source)
      const from = parsed.from?.text || ''

      if (isHaroSender(from)) {
        emails.push({
          uid: msg.uid,
          from,
          subject: parsed.subject || '',
          text: parsed.text || parsed.html || '',
          date: parsed.date,
        })
      }
    }

    await client.logout()
  } catch (err) {
    await client.logout().catch(() => {})
    throw err
  }

  return emails
}

async function markAsRead(uid) {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  })

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')
    await client.messageFlagsAdd(uid, ['\\Seen'])
    await client.logout()
  } catch {
    await client.logout().catch(() => {})
  }
}

// ── Gmail SMTP (send / save draft) ───────────────────────────────────────────

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  })
}

async function saveDraft(to, subject, body) {
  // Save to Gmail Drafts via IMAP APPEND
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  })

  const raw = [
    `From: ${SENDER_NAME} <${GMAIL_USER}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    body,
  ].join('\r\n')

  try {
    await client.connect()
    // Gmail Drafts folder is usually "[Gmail]/Drafts"
    const folders = ['[Gmail]/Drafts', 'Drafts', '[Google Mail]/Drafts']
    let saved = false
    for (const folder of folders) {
      try {
        await client.append(folder, Buffer.from(raw), ['\\Draft'])
        saved = true
        break
      } catch {}
    }
    await client.logout()
    return saved
  } catch (err) {
    await client.logout().catch(() => {})
    throw err
  }
}

async function sendEmail(to, subject, body) {
  const transport = createTransport()
  await transport.sendMail({
    from: `${SENDER_NAME} <${GMAIL_USER}>`,
    to,
    subject,
    text: body,
  })
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function processOnce() {
  console.log(`\n🔍 Checking Gmail for HARO queries... (${new Date().toLocaleTimeString()})`)

  if (DRY_RUN) {
    console.log('  [dry-run] Would connect to Gmail and fetch unread HARO emails')
    console.log('  [dry-run] Would check queries against WalletLens keywords')
    console.log('  [dry-run] Would use Claude to draft responses')
    console.log('  [dry-run] Would save drafts to Gmail')
    return
  }

  let emails
  try {
    emails = await fetchUnreadHaroEmails()
  } catch (err) {
    console.error(`  ❌ Gmail connection failed: ${err.message}`)
    console.error('  Check GMAIL_USER and GMAIL_APP_PASSWORD env vars.')
    return
  }

  if (emails.length === 0) {
    console.log('  No new HARO emails found.')
    return
  }

  console.log(`  Found ${emails.length} HARO email(s).`)

  let drafted = 0
  let skipped = 0

  for (const email of emails) {
    console.log(`\n  📧 "${email.subject}"`)

    const queries = parseHaroEmail(email.text)
    console.log(`     ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'} parsed`)

    for (const query of queries) {
      if (!isRelevant(query)) {
        skipped++
        continue
      }

      console.log(`     ✅ Relevant: "${(query.title || query.text.slice(0, 60)).trim()}..."`)
      console.log(`        Outlet: ${query.outlet || 'unknown'} | Email: ${query.email || 'n/a'}`)

      // Draft response with Claude
      let responseBody
      try {
        responseBody = await draftResponse(query)
      } catch (err) {
        console.error(`        ❌ Claude error: ${err.message}`)
        continue
      }

      const subject = `Re: ${query.title || email.subject}`
      const to = query.email || 'UNKNOWN — check original email'

      if (AUTO_SEND && query.email) {
        try {
          await sendEmail(to, subject, responseBody)
          console.log(`        📤 Sent to ${to}`)
          drafted++
        } catch (err) {
          console.error(`        ❌ Send failed: ${err.message}`)
        }
      } else {
        try {
          const saved = await saveDraft(to, subject, responseBody)
          if (saved) {
            console.log(`        💾 Draft saved (review in Gmail before sending)`)
          } else {
            console.log(`        ⚠️  Could not save draft — printing response:`)
            console.log('---')
            console.log(responseBody)
            console.log('---')
          }
          drafted++
        } catch (err) {
          console.error(`        ❌ Draft save failed: ${err.message}`)
          console.log(`        Response:\n${responseBody}`)
        }
      }
    }

    // Mark email as read so we don't process it again
    await markAsRead(email.uid)
  }

  console.log(`\n  Done. ${drafted} draft(s) created, ${skipped} irrelevant quer${skipped === 1 ? 'y' : 'ies'} skipped.`)
  if (drafted > 0 && !AUTO_SEND) {
    console.log('  👉 Open Gmail Drafts, review each response, then send.')
  }
}

async function main() {
  if (!DRY_RUN) {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      console.error('❌ Set GMAIL_USER and GMAIL_APP_PASSWORD env vars.')
      console.error('   Get an App Password: myaccount.google.com/apppasswords')
      process.exit(1)
    }
    if (!ANTHROPIC_API_KEY) {
      console.error('❌ Set ANTHROPIC_API_KEY env var.')
      process.exit(1)
    }
  }

  console.log('🤖 WalletLens HARO Auto-Responder')
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : AUTO_SEND ? 'AUTO-SEND' : 'DRAFT (saves to Gmail Drafts)'}`)
  console.log(`   Watch: ${WATCH ? `every ${POLL_MS / 60000} min` : 'one-shot'}`)

  if (WATCH) {
    while (true) {
      await processOnce()
      console.log(`\n⏳ Next check in ${POLL_MS / 60000} minutes. Ctrl+C to stop.`)
      await sleep(POLL_MS)
    }
  } else {
    await processOnce()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
