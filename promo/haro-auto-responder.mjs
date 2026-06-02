#!/usr/bin/env node
/**
 * WalletLens — HARO / Connectively Auto-Responder
 *
 * Monitors your email (Spaceship mail or any IMAP provider) for
 * Connectively/HARO query emails, identifies relevant queries
 * (portfolio tracking, net worth, crypto, investing tools), uses
 * Claude to draft a personalized response, and saves it to Drafts.
 *
 * ── Quick start (Spaceship mail) ─────────────────────────────────────────────
 *
 *   npm install imapflow mailparser nodemailer @anthropic-ai/sdk
 *
 *   MAIL_USER=contact@walletlens.live \
 *   MAIL_PASS=yourpassword \
 *   ANTHROPIC_API_KEY=sk-ant-... \
 *   SENDER_NAME="Your Name" \
 *   node promo/haro-auto-responder.mjs
 *
 * ── Spaceship mail IMAP/SMTP settings ────────────────────────────────────────
 *   IMAP host: imap.spacemail.com  port: 993  SSL: yes
 *   SMTP host: smtp.spacemail.com  port: 465  SSL: yes
 *   Username:  your full email address (contact@walletlens.live)
 *   Password:  your Spaceship email password
 *
 *   Find your exact hostnames at:
 *   Spaceship dashboard → Email → your mailbox → "Email client settings"
 *
 *   If imap.spacemail.com also fails, pass the correct host explicitly:
 *   IMAP_HOST=mail.yourdomain.com SMTP_HOST=mail.yourdomain.com node ...
 *
 * ── Override for a different provider ────────────────────────────────────────
 *   IMAP_HOST=imap.example.com IMAP_PORT=993 \
 *   SMTP_HOST=smtp.example.com SMTP_PORT=465 \
 *   MAIL_USER=you@example.com MAIL_PASS=yourpass \
 *   node promo/haro-auto-responder.mjs
 *
 * ── Flags ─────────────────────────────────────────────────────────────────────
 *   (none)          Check once, save matching queries as Drafts
 *   --auto-send     Send responses immediately instead of saving drafts
 *   --watch         Poll every 30 minutes continuously
 *   --dry-run       Print what would be done without touching email
 */

import Anthropic from '@anthropic-ai/sdk'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import { setTimeout as sleep } from 'timers/promises'

// ── Config ────────────────────────────────────────────────────────────────────

// Mail credentials (Spaceship defaults)
const MAIL_USER  = process.env.MAIL_USER  || ''
const MAIL_PASS  = process.env.MAIL_PASS  || ''
const IMAP_HOST  = process.env.IMAP_HOST  || 'imap.spacemail.com'
const IMAP_PORT  = parseInt(process.env.IMAP_PORT  || '993', 10)
const SMTP_HOST  = process.env.SMTP_HOST  || 'smtp.spacemail.com'
const SMTP_PORT  = parseInt(process.env.SMTP_PORT  || '465', 10)

const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY  || ''
const SENDER_NAME        = process.env.SENDER_NAME        || 'WalletLens'
const REPLY_FROM         = process.env.REPLY_FROM         || MAIL_USER || 'contact@walletlens.live'

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

// ── IMAP helpers ──────────────────────────────────────────────────────────────

function makeImapClient() {
  return new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: MAIL_USER, pass: MAIL_PASS },
    logger: false,
  })
}

function isHaroSender(from) {
  if (!from) return false
  return HARO_SENDERS.some(domain => from.toLowerCase().includes(domain))
}

async function fetchUnreadHaroEmails() {
  const client = makeImapClient()

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
  const client = makeImapClient()

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')
    await client.messageFlagsAdd(uid, ['\\Seen'])
    await client.logout()
  } catch {
    await client.logout().catch(() => {})
  }
}

// ── SMTP (send / save draft) ──────────────────────────────────────────────────

function createTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,  // true for 465 (SSL), false for 587 (STARTTLS)
    auth: { user: MAIL_USER, pass: MAIL_PASS },
  })
}

async function saveDraft(to, subject, body) {
  // Save to Drafts folder via IMAP APPEND
  const client = makeImapClient()

  const raw = [
    `From: ${SENDER_NAME} <${REPLY_FROM}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    body,
  ].join('\r\n')

  try {
    await client.connect()
    // Try common Drafts folder names across providers
    const folders = ['Drafts', 'INBOX.Drafts', '[Gmail]/Drafts', 'Draft']
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
    from: `${SENDER_NAME} <${REPLY_FROM}>`,
    to,
    subject,
    text: body,
  })
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function processOnce() {
  console.log(`\n🔍 Checking email for HARO queries... (${new Date().toLocaleTimeString()})`)

  if (DRY_RUN) {
    console.log('  [dry-run] Would connect to IMAP and fetch unread HARO emails')
    console.log('  [dry-run] Would check queries against WalletLens keywords')
    console.log('  [dry-run] Would use Claude to draft responses')
    console.log('  [dry-run] Would save drafts to Drafts folder')
    return
  }

  let emails
  try {
    emails = await fetchUnreadHaroEmails()
  } catch (err) {
    console.error(`  ❌ IMAP connection failed: ${err.message}`)
    console.error(`  Check MAIL_USER, MAIL_PASS, IMAP_HOST (${IMAP_HOST}:${IMAP_PORT}) env vars.`)
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
            console.log(`        💾 Draft saved (review in your mail client before sending)`)
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
    console.log('  👉 Open your Drafts folder, review each response, then send.')
  }
}

async function main() {
  if (!DRY_RUN) {
    if (!MAIL_USER || !MAIL_PASS) {
      console.error('❌ Set MAIL_USER and MAIL_PASS env vars.')
      console.error('   MAIL_USER=contact@walletlens.live MAIL_PASS=yourpassword')
      process.exit(1)
    }
    if (!ANTHROPIC_API_KEY) {
      console.error('❌ Set ANTHROPIC_API_KEY env var.')
      process.exit(1)
    }
  }

  console.log('🤖 WalletLens HARO Auto-Responder')
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : AUTO_SEND ? 'AUTO-SEND' : 'DRAFT (saves to Drafts folder)'}`)
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
