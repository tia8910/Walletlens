// WalletLens voice-parse API — Deno Deploy edition.
//
// A single-file serverless endpoint that turns a raw speech-to-text (or typed)
// transcript into one or more structured trades using Claude. The Anthropic
// key lives ONLY here as the `ANTHROPIC_API_KEY` env secret — it is never sent
// to the browser, so it can't be stolen from the public static site.
//
// Deploy: see voice-api/README.md (Deno Deploy, free).
//
// Request:  POST { transcript: string, hintLang?: 'en'|'ar' }
// Response: { ok: true, trades: [ { type, symbol, name?, amount, price? } ] }

const ALLOWED_ORIGINS = new Set([
  "https://walletlens.live",
  "https://www.walletlens.live",
  "http://localhost:5173",
  "http://localhost:4173",
])

// Cloudflare Pages serves the site from a project subdomain plus a per-deploy
// (and per-branch) preview subdomain, e.g. https://walletlenslive1.pages.dev,
// https://<hash>.walletlenslive.pages.dev, https://<branch>.walletlenslive.pages.dev.
// Allow the whole project so previews can reach the API too — scoped to our
// project name, not all of *.pages.dev.
const PAGES_PREVIEW = /^https:\/\/([a-z0-9-]+\.)?walletlenslive1?\.pages\.dev$/

function isAllowedOrigin(origin: string | null): boolean {
  return !!origin && (ALLOWED_ORIGINS.has(origin) || PAGES_PREVIEW.test(origin))
}

function corsHeaders(origin: string | null): HeadersInit {
  const allow = isAllowedOrigin(origin) ? (origin as string) : "https://walletlens.live"
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Vary": "Origin",
    "Content-Type": "application/json",
  }
}

// ── Price proxy (GET /proxy?url=…) ──────────────────────────────────────────
// The static site can't reach some price APIs directly: they lack CORS headers
// (CoinGecko, Stooq, Yahoo) or are geo-blocked from the user's own IP (Binance
// in some regions). This server-side proxy fetches an allowlisted upstream and
// returns it with permissive CORS, so prices work on every network/region
// without relying on flaky public CORS proxies. Allowlist-only = not an open
// proxy. No secrets involved; safe to run unauthenticated.
const PROXY_ALLOWLIST = new Set([
  "api.coingecko.com",
  "min-api.cryptocompare.com",
  "api.binance.com",
  "api1.binance.com",
  "api-gcp.binance.com",
  "api.gold-api.com",
  "stooq.com",
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
  "rest.coincap.io",
  "api.coincap.io",
  "api.coinpaprika.com",
  "open.er-api.com",
  "api.frankfurter.app",
  // Asset logo CDNs — proxied so coin logos load on networks that block them
  "coin-images.coingecko.com",
  "assets.coingecko.com",
  "cdn.jsdelivr.net",
  "assets.coincap.io",
  "raw.githubusercontent.com",
  "lcw.nyc3.cdn.digitaloceanspaces.com",
])

async function handleProxy(target: string | null, headers: HeadersInit): Promise<Response> {
  if (!target) {
    return new Response(JSON.stringify({ error: "missing_url" }), { status: 400, headers })
  }
  let parsed: URL
  try { parsed = new URL(target) } catch {
    return new Response(JSON.stringify({ error: "bad_url" }), { status: 400, headers })
  }
  if (parsed.protocol !== "https:" || !PROXY_ALLOWLIST.has(parsed.hostname)) {
    return new Response(JSON.stringify({ error: "host_not_allowed" }), { status: 403, headers })
  }
  try {
    const upstream = await fetch(parsed.toString(), {
      headers: { "Accept": "application/json, text/csv, image/*, */*", "User-Agent": "WalletLens-Proxy/1.0" },
      signal: AbortSignal.timeout(8000),
    })
    // If the upstream redirected, the final host must still be allowlisted —
    // otherwise an allowlisted API could bounce us to an arbitrary URL (SSRF).
    try {
      const finalHost = new URL(upstream.url).hostname
      if (finalHost && !PROXY_ALLOWLIST.has(finalHost)) {
        return new Response(JSON.stringify({ error: "redirect_not_allowed" }), { status: 502, headers })
      }
    } catch { /* upstream.url unavailable — keep going with the body checks */ }
    // Cap the passthrough at 5 MB — price JSON and logos are tiny; anything
    // bigger would only tie up server memory.
    const MAX_BODY = 5 * 1024 * 1024
    const cl = Number(upstream.headers.get("content-length") || 0)
    if (cl > MAX_BODY) {
      return new Response(JSON.stringify({ error: "response_too_large" }), { status: 502, headers })
    }
    // Pass bytes through untouched — text() would corrupt binary (logo images)
    const body = await upstream.arrayBuffer()
    if (body.byteLength > MAX_BODY) {
      return new Response(JSON.stringify({ error: "response_too_large" }), { status: 502, headers })
    }
    const ct = upstream.headers.get("content-type") || "application/json"
    const isImage = ct.startsWith("image/")
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...headers,
        "Content-Type": ct,
        // Logos are immutable — cache long; price data stays fresh
        "Cache-Control": isImage ? "public, max-age=86400" : "public, max-age=30",
      },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: "upstream_failed", detail: String(e) }), { status: 502, headers })
  }
}

// ── Email sending (Resend) ──────────────────────────────────────────────────
// Transactional / marketing mail goes out from contact@walletlens.live.
// Requires the RESEND_API_KEY env secret and a verified walletlens.live domain
// in the Resend dashboard.
const MAIL_FROM = "WalletLens <contact@walletlens.live>"
// Portfolio Guardian is an unattended, automated notifier — its mail is sent
// from a no-reply address so heirs don't reply into a mailbox nobody watches.
// Replies are still routed to contact@ so anyone who does hit "reply" reaches us.
const GUARDIAN_FROM = "WalletLens Portfolio Guardian <noreply@walletlens.live>"

// Returns the raw send result so callers that need to explain a failure to the
// user (e.g. the Guardian test-email) can surface Resend's actual reason
// instead of a generic error. `reason` is null on success.
async function sendEmailResult(
  to: string, subject: string, html: string,
  from: string = MAIL_FROM, replyTo: string = "contact@walletlens.live",
): Promise<{ ok: boolean; reason: string | null }> {
  const key = Deno.env.get("RESEND_API_KEY")
  if (!key) return { ok: false, reason: "mail_not_configured" }
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject, html, reply_to: replyTo }),
    })
    if (resp.ok) return { ok: true, reason: null }
    const detail = await resp.text().catch(() => "")
    console.error("Resend error:", resp.status, detail)
    // Resend puts a human-readable "message" in its JSON error body — the most
    // common being "domain is not verified" (blocks sending to non-owner
    // addresses). Pass it through so the UI can tell the user what to fix.
    let msg = ""
    try { msg = JSON.parse(detail)?.message || "" } catch { /* non-JSON */ }
    return { ok: false, reason: msg || `resend_${resp.status}` }
  } catch (e) {
    console.error("Resend exception:", e)
    return { ok: false, reason: "network_error" }
  }
}

async function sendEmail(
  to: string, subject: string, html: string, from: string = MAIL_FROM,
): Promise<boolean> {
  return (await sendEmailResult(to, subject, html, from)).ok
}

// ── WhatsApp sending (Meta WhatsApp Cloud API) ───────────────────────────────
// Optional second notification channel for Portfolio Guardian. Requires the
// WHATSAPP_TOKEN and WHATSAPP_PHONE_ID env secrets (a WhatsApp Business number
// on the Meta Cloud API). Absent config is a graceful no-op — email still goes.
// Note: outside the 24-hour customer-service window Meta only delivers approved
// message *templates*; set WHATSAPP_TEMPLATE to a template name to use one,
// otherwise we send free-form text (delivered when the recipient has messaged
// the business number recently, e.g. for the test send).
function normalizePhone(raw: unknown): string | null {
  const digits = String(raw || "").replace(/[^\d+]/g, "")
  const e164 = digits.startsWith("+") ? digits : "+" + digits
  // E.164: leading +, 8–15 digits, first digit non-zero.
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null
}

async function sendWhatsAppResult(
  to: string, text: string,
): Promise<{ ok: boolean; reason: string | null }> {
  const token = Deno.env.get("WHATSAPP_TOKEN")
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID")
  if (!token || !phoneId) return { ok: false, reason: "whatsapp_not_configured" }
  const phone = normalizePhone(to)
  if (!phone) return { ok: false, reason: "invalid_phone" }
  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone.replace(/^\+/, ""),
        type: "text",
        text: { preview_url: false, body: text.slice(0, 4096) },
      }),
    })
    if (resp.ok) return { ok: true, reason: null }
    const detail = await resp.text().catch(() => "")
    console.error("WhatsApp error:", resp.status, detail)
    let msg = ""
    try { msg = JSON.parse(detail)?.error?.message || "" } catch { /* non-JSON */ }
    return { ok: false, reason: msg || `whatsapp_${resp.status}` }
  } catch (e) {
    console.error("WhatsApp exception:", e)
    return { ok: false, reason: "network_error" }
  }
}

// Normalise + validate an heir list. Each heir may be reachable by email,
// WhatsApp, or both — keep any heir that has at least one valid channel.
// deno-lint-ignore no-explicit-any
function sanitizeHeirs(heirs: any): { name: string; email?: string; whatsapp?: string }[] {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return (Array.isArray(heirs) ? heirs : [])
    .slice(0, 3)
    // deno-lint-ignore no-explicit-any
    .map((h: any) => {
      const email = typeof h?.email === "string" && emailRe.test(h.email.trim())
        ? h.email.trim().toLowerCase() : undefined
      const whatsapp = normalizePhone(h?.whatsapp) || undefined
      if (!email && !whatsapp) return null
      const cleaned: { name: string; email?: string; whatsapp?: string } = {
        name: String(h?.name || "").trim().slice(0, 80) || "Heir",
      }
      if (email) cleaned.email = email
      if (whatsapp) cleaned.whatsapp = whatsapp
      return cleaned
    })
    .filter((h): h is { name: string; email?: string; whatsapp?: string } => h !== null)
}

// Branded HTML shell so every email looks consistent.
function emailShell(bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#0b0f14;font-family:'Plus Jakarta Sans',Segoe UI,system-ui,sans-serif;color:#e6edf3;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#11161d;border:1px solid #1f2730;border-radius:16px;overflow:hidden">
    <div style="padding:22px 28px;border-bottom:1px solid #1f2730">
      <span style="font-size:20px;font-weight:800;color:#4ade80">WalletLens</span>
      <span style="font-size:11px;color:#7d8794;letter-spacing:.08em;margin-left:8px">TRACK · ANALYZE · GROW</span>
    </div>
    <div style="padding:28px">${bodyHtml}</div>
    <div style="padding:18px 28px;border-top:1px solid #1f2730;font-size:12px;color:#6b7480">
      You're receiving this because you joined WalletLens at
      <a href="https://walletlens.live" style="color:#4ade80;text-decoration:none">walletlens.live</a>.<br>
      100% free · private · no account. Reply <b>unsubscribe</b> to stop.
    </div>
  </div></body></html>`
}

const WELCOME_HTML = emailShell(`
  <h1 style="margin:0 0 14px;font-size:22px;color:#fff">Welcome aboard! 🎉</h1>
  <p style="margin:0 0 14px;line-height:1.6;color:#c4cdd6">
    Thanks for joining WalletLens — the <b>free, private</b> net-worth tracker for crypto, stocks, metals, cash &amp; real estate. No account, your data never leaves your device.
  </p>
  <p style="margin:0 0 18px;line-height:1.6;color:#c4cdd6">
    Here's the fastest way to start: import your whole portfolio from a <b>screenshot</b> — no API keys, no manual typing.
  </p>
  <a href="https://walletlens.live/dashboard" style="display:inline-block;background:#4ade80;color:#04210f;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:12px">Open my dashboard →</a>
  <p style="margin:22px 0 0;line-height:1.6;color:#8a93a0;font-size:13px">
    You'll get a weekly market-sentiment digest and early access to new features. That's it.
  </p>
`)

function buildPrompt(transcript: string, hintLang: string, alternatives: string[]): string {
  // When several speech-to-text engines disagree, listing every candidate
  // lets the model triangulate the true utterance — the single biggest
  // accuracy win for garbled or accented speech.
  const altBlock = alternatives.length > 1
    ? `\nThe speech-to-text engines produced these CANDIDATE transcripts of the SAME spoken sentence. They may disagree, drop words, or mis-hear coins — reconcile them into the single true intent (a coin appearing in any candidate is strong evidence it was said):\n${alternatives.map((a, i) => `  ${i + 1}. "${a}"`).join("\n")}\n\nPrimary (best-guess) transcript: "${transcript}"\n`
    : `\nTranscript: "${transcript}"\n`

  return `You are a world-class voice-trade interpreter for a crypto/stock/metals portfolio app. Accuracy is critical — a wrong coin or amount records a wrong trade.

The user spoke into their microphone (or typed) this. The speech engine may mis-hear words, mix languages, or transcribe Arabic phonetically as English (e.g. "اشتري واحد بيتكوين" → "street ultra bitcoin"). Slang/dialect is common: Saudi, Egyptian, Levantine, Maghrebi Arabic; English trader slang like "aped", "hodl", "scoop", "yolo'd", "tp'd".

Transcript hint language: ${hintLang}
${altBlock}
Extract EVERY trade. Return STRICT JSON ONLY — no markdown, no commentary:

{
  "trades": [
    { "type": "buy" | "sell" | null, "symbol": "BTC", "name": "Bitcoin", "amount": <number | null>, "price": <number or null> }
  ]
}

Rules:
- MULTIPLE trades in one sentence → one object PER asset. Scan the ENTIRE sentence from start to finish — NEVER stop after the first coin. "I bought 1 Bitcoin and 1 Ethereum" → [{buy BTC 1},{buy ETH 1}]. "اشتريت واحد بيتكوين وواحد ايثيريوم" → the same two trades. A single intent verb governs every coin listed after it until a new verb appears — apply it to each. If you returned only 1 trade but the sentence contains multiple coin names, you missed trades — re-read and add them all.
- Worked Arabic example: "اشتريت اثنين سولانا وثلاث ايثيريوم وبعت نص بيتكوين" → [{buy SOL 2},{buy ETH 3},{sell BTC 0.5}]. The verb switches to "بعت" (sell) for Bitcoin only.
- A shared amount before a list applies to each unless a per-coin amount is given: "2 Solana and 3 Cardano" → [SOL×2, ADA×3]; "5 of Bitcoin and Ethereum" → [BTC×5, ETH×5].
- Arabic "و" / "و " (and) separates assets: "بيتكوين وايثيريوم" = two assets. So does a comma or pause.
- Too garbled to extract any trade → { "trades": [] }.
- Arabic dialect intent verbs: اشتري/اشتريت/شريت/جبت/أخذت/خذيت/حطيت/كومت/جمعت/كسبت/استثمرت/دخلت/نزلت = BUY; بعت/بيع/صفيت/سحبت/كسرت/خرجت/طرحت/جنيت/طلعت/فشيت = SELL.
- Arabic spelled numbers: واحد=1, اثنين/اتنين=2, ثلاثة/تلاتة=3, اربعة=4, خمسة=5, عشرة=10.
- Amount slang: "5K"/"5 grand" = 5000; "2 mil" = 2,000,000; "half"/"نص"/"نصف" = 0.5; "quarter"/"ربع" = 0.25; الف/ألف=1000, مليون=1,000,000.
- Coin mis-hearings: Selena/Salina/Celina = Solana; "a theorem"/"etherium"/"a theory" = Ethereum; "big point"/"bit corn" = Bitcoin; "polka dot" = Polkadot; "chain link"/"jane link" = Chainlink; "ava lunch" = Avalanche; "throne" = TRON; "dough"/"doggie coin" = Dogecoin; "rebel"/"ripple" = XRP.
- Stocks: Apple=AAPL, Tesla=TSLA, Microsoft=MSFT, NVIDIA=NVDA, Google=GOOGL, Amazon=AMZN, Meta=META, Palantir=PLTR, Coinbase=COIN, Robinhood=HOOD.
- Metals: gold=XAU, silver=XAG, platinum=XPT, copper=HG.
- A coin with no clear buy/sell intent or amount → still include it with "type": null and "amount": null; the user will fill in the details.`
}

// ── In-app assistant ──────────────────────────────────────────────────────
// A lightweight feature-finder chat. Understands the app's feature map and
// points users at the right page/tab via [[nav:/route|Label]] markers that the
// client turns into one-tap buttons. Uses Haiku for speed/cost.
const ASSISTANT_FEATURES = [
  "- Dashboard (/dashboard): Net worth overview, P&L, allocation donut, holdings by category.",
  "- AI Analysis (/dashboard?tab=ai): Portfolio health score, Fear & Greed gauge, stress test, rebalance planner, entry quality, risk scanner.",
  "- Sell Targets (/dashboard?tab=targets): Set price targets per asset and track progress toward taking profit.",
  "- Price Alerts (/dashboard?tab=alerts): Get notified when an asset crosses a price you choose.",
  "- Wallets & Backup (/dashboard?tab=manage): Manage wallets and export/import your data as a backup code.",
  "- Transactions (/transactions): Log buys/sells and view full trade history.",
  "- Whale Tracker (/whales): Large on-chain transactions and smart-money / volume signals.",
  "- Alpha (/alpha): Deep-dive portfolio analytics and correlation/sector views.",
  "- Coach (/coach): Portfolio evaluation across BTC anchor, diversification, stablecoin reserve, P&L health.",
  "- Technicals (/technicals): RSI, MACD, Bollinger Bands and trend signals per asset.",
  "- Academy (/academy): Educational guides on investing and using WalletLens.",
  "- Settings (/settings): Theme, display currency, language, biometric lock, backup/export.",
].join("\n")

function buildAssistantSystem(lang: string): string {
  const langLine = lang === "ar"
    ? "Reply in Arabic (the user is using the app in Arabic)."
    : "Reply in English."
  return `You are the friendly in-app assistant for WalletLens, a free, private, all-asset portfolio tracker (crypto, precious metals, stocks, and cash). Your job is to understand what the user wants to accomplish and point them to the right feature.

${langLine}

Be concise and warm — usually 1–3 short sentences. Do not invent features that are not in the list. WalletLens is 100% local: no account, no wallet connection, data never leaves the device — reassure users about privacy when relevant.

Available features (and their routes):
${ASSISTANT_FEATURES}

When you recommend a place in the app for the user to go, ALWAYS end that recommendation with a navigation marker on its own line, in this exact format:
[[nav:/route|Button Label]]

Examples:
- "where do I add a trade?" → "You can log buys and sells in Transactions. [[nav:/transactions|Open Transactions]]"
- "is my portfolio too risky?" → "Run the AI Analysis — it gives a health score and a stress test. [[nav:/dashboard?tab=ai|Open AI Analysis]]"
- "I want to plan when to sell" → "Set price targets per asset and track progress. [[nav:/dashboard?tab=targets|Open Sell Targets]]"

You may include more than one marker if several features fit. Only use routes from the list above. If the user asks something unrelated to the app, answer briefly and helpfully without a marker.`
}

// deno-lint-ignore no-explicit-any
function filterTrades(arr: any): any[] {
  return Array.isArray(arr)
    ? arr.filter((t) => {
      if (!t || !t.symbol) return false
      if ((t.type === "buy" || t.type === "sell") && typeof t.amount === "number" && t.amount > 0) return true
      // Partial: coin only — user fills in type + amount in the edit card
      if (!t.type && t.amount == null) return true
      return false
    })
    : []
}

// ── Magic Indicator AI verdict ────────────────────────────────────────────
// Synthesises the already-computed numeric pillars (technical, on-chain,
// volume, whales, fundamental) into a concise natural-language direction.
// The LLM does NOT fetch live data — it reasons over the supplied numbers plus
// its own knowledge of the asset's fundamentals/tokenomics.
// deno-lint-ignore no-explicit-any
function buildAnalyzePrompt(p: any): string {
  const pillars = Array.isArray(p?.pillars)
    ? p.pillars.map((x: any) => `  - ${x.label}: ${x.score} (${x.note})`).join("\n")
    : "  (none)"
  const stats = p?.stats && typeof p.stats === "object"
    ? Object.entries(p.stats).map(([k, v]) => `  - ${k}: ${v}`).join("\n")
    : "  (none)"
  return `You are a seasoned crypto markets analyst. A quantitative engine has scored ${p?.asset?.name || p?.asset?.symbol || "an asset"} (${p?.asset?.symbol || "?"}) across five pillars, each from -100 (bearish) to +100 (bullish).

Composite Magic score: ${p?.magic?.score} → "${p?.magic?.direction}" (confidence ${p?.magic?.confidence}%).

Pillar scores:
${pillars}

Key stats:
${stats}

Using these numbers AND your knowledge of this asset's fundamentals, tokenomics and typical market behaviour, give a crisp portfolio-holder verdict. Be specific and avoid generic hedging. Return STRICT JSON ONLY — no markdown, no commentary:

{
  "direction": "Strong Buy" | "Accumulate" | "Neutral" | "Reduce" | "Distribute",
  "oneLiner": "<=18 word punchy thesis",
  "bull": ["<short bull point>", "<short bull point>"],
  "bear": ["<short bear/risk point>", "<short bear/risk point>"],
  "action": "<one concrete next step for a holder, <=20 words>"
}

Keep bull/bear to 2-3 items each. Ground every point in the pillars/stats or well-known facts about the asset. This is analysis, not financial advice.`
}

// ── Portfolio Vision advice ────────────────────────────────────────────────
// Reviews the user's planning "buckets" (goals, targets, monthly cash-flow) and
// asset-class mix, and returns concrete, prioritised planning advice. Reasons
// over the supplied numbers + general personal-finance best practice. Education,
// not individualised financial advice.
// deno-lint-ignore no-explicit-any
function buildVisionAdvicePrompt(p: any): string {
  const cur = p?.currency || "USD"
  const cats = Array.isArray(p?.categories) && p.categories.length
    ? p.categories.map((c: any) => `  - ${c.name}: ${cur} ${Math.round(c.value).toLocaleString()} (${c.pct}%)`).join("\n")
    : "  (no live holdings — planning from manual amounts)"
  const buckets = Array.isArray(p?.buckets) && p.buckets.length
    ? p.buckets.map((b: any) => {
        const bits = [
          `type: ${b.type}`,
          `current: ${cur} ${Math.round(b.current || 0).toLocaleString()}`,
          b.target ? `target: ${cur} ${Math.round(b.target).toLocaleString()}` : null,
          b.targetMonths ? `timeframe: ${b.targetMonths} months` : null,
          b.monthlyContribution ? `adding: ${cur} ${Math.round(b.monthlyContribution).toLocaleString()}/mo` : null,
          b.monthlyWithdrawal ? `drawing: ${cur} ${Math.round(b.monthlyWithdrawal).toLocaleString()}/mo` : null,
          b.categories?.length ? `focus: ${b.categories.join(", ")}` : null,
          `${b.pctOfNW || 0}% of net worth`,
        ].filter(Boolean).join(" · ")
        return `  - "${b.name}" — ${bits}`
      }).join("\n")
    : "  (no buckets yet)"
  const m = p?.monthly || {}

  return `You are a sharp, fiduciary-minded personal-finance and portfolio-planning advisor inside WalletLens (a private, all-asset net-worth tracker: crypto, stocks, metals, cash, real estate). The user has organised their money into planning "buckets" (goals). Give specific, prioritised, numbers-grounded advice — diversification, emergency-fund adequacy, withdrawal sustainability (~4%/yr rule of thumb), goal funding pace, concentration risk, and asset-class fit per goal. Be concrete and avoid generic hedging. This is education, not individualised financial advice.

Asset-class notes:
- "Stablecoins" = USD-pegged tokens (USDT, USDC, DAI, etc.). Cash-equivalent, low-risk, appropriate for emergency funds, short-term goals, and liquidity reserves. Do NOT treat them as volatile crypto.
- "Crypto" = volatile non-stable coins only (BTC, ETH, SOL, etc.). High risk, long-term growth.

Total net worth: ${cur} ${Math.round(p?.netWorth || 0).toLocaleString()}
Asset-class mix:
${cats}
Monthly plan: adding ${cur} ${Math.round(m.in || 0).toLocaleString()} · drawing ${cur} ${Math.round(m.out || 0).toLocaleString()} · net ${cur} ${Math.round(m.net || 0).toLocaleString()}
Buckets:
${buckets}

Return STRICT JSON ONLY — no markdown, no commentary:

{
  "headline": "<=14 word overall verdict on this plan",
  "score": <integer 0-100 plan-health: diversification + emergency cover + goal feasibility + withdrawal safety>,
  "insights": [
    { "title": "<=6 words", "detail": "<=30 words, specific & numbers-grounded", "level": "good" | "warn" | "tip" }
  ],
  "actions": [ "<one concrete next step, <=18 words>" ]
}

Give 3-6 insights and 2-4 actions. Every point must reference the user's actual numbers/buckets above. If a bucket is underfunded for its timeframe, say by how much per month. If an emergency fund is missing or thin, flag it. If one asset class dominates, call out the concentration.`
}

// ── Daily market recap (mode: "recap") ─────────────────────────────────────
// Writes one dated, data-grounded all-markets recap (crypto + stocks + metals)
// for the blog. The caller (the daily-recap GitHub workflow) sends only a
// pre-formatted market snapshot + the date; the prompt is built HERE so this
// stays a constrained recap generator, not an open text endpoint. Returns the
// parsed article fields. The Anthropic key never leaves this server.
function buildRecapPrompt(snapshotText: string, dateStr: string, year: number): { system: string; prompt: string } {
  const system = `You are the senior markets writer for WalletLens (walletlens.live), a free, private, browser-based portfolio tracker for crypto, stocks, precious metals, real estate and cash — all in one net-worth view, no account, all data on-device. You write concise, accurate daily market recaps. Educational, never financial advice. Never invent numbers — use ONLY the data provided. Never promise or predict prices.`

  const prompt = `Write today's all-markets daily recap for ${dateStr}.

Today's live snapshot (use these exact numbers — do not invent others):
${snapshotText}

Write a tight, scannable recap (450-650 words) covering crypto, US stocks and precious metals together, so a reader sees the whole picture in one place. Requirements:
- Open with 1-2 plain paragraphs summarising the day's cross-market mood (NO H1 — the title is rendered separately).
- Use ## H2 sections. Suggested: "Crypto", "Stocks", "Precious Metals", then a short "What It Means" wrap-up.
- Include a Markdown table summarising the key moves (asset, level/price, 24h change).
- Reference the crypto Fear & Greed reading and what that sentiment band signals (no prediction).
- Mention WalletLens naturally ONCE or TWICE where it genuinely helps (e.g. tracking crypto + stocks + metals in one net-worth view), and link [walletlens.live](https://walletlens.live) once and the [Fear & Greed Index](/fear-and-greed-index) once.
- End with a one-line educational-not-advice note.
- Use the year ${year} where natural.

Return EXACTLY this plain-text format. Begin your reply immediately with "TITLE:" — output nothing before it, no preamble, no code fences:

TITLE: <specific, <=70 chars, includes the date, e.g. "Markets Today — ${dateStr}: ...">
SUMMARY: <1-2 sentence meta description, 120-160 chars, mentions crypto, stocks and metals>
READTIME: <N min read>
BODY:
<the full recap body in Markdown>`

  return { system, prompt }
}

// ── Portfolio Guardian notification content ─────────────────────────────────
// One place that builds the heir-facing message so the live notification, the
// test send, and the WhatsApp text all stay in sync.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function guardianContent(opts: {
  ownerName?: string
  message?: string
  valueStr: string
  assetStr: string
  lastSeen: string
  intervalDays?: number
  isTest?: boolean
}): { subject: string; html: string; whatsapp: string } {
  const { message = "", valueStr, assetStr, lastSeen, isTest = false } = opts
  const owner = (opts.ownerName || "").trim()
  const testBanner = isTest ? `
    <div style="background:#3a2a0a;border:1px solid #a16207;border-radius:12px;padding:14px 18px;margin:0 0 22px">
      <p style="margin:0;color:#fde68a;font-weight:800;font-size:15px">✅ This is only a test</p>
      <p style="margin:6px 0 0;color:#e7d9b0;font-size:13px;line-height:1.6">The WalletLens owner sent this to confirm Portfolio Guardian can reach you. Nothing has happened — they are fine. No action is needed. It's a good idea to save this email so you know where to look if it's ever real.</p>
    </div>` : ""

  const heading = isTest
    ? "You've been named as someone's heir"
    : `${owner ? escapeHtml(owner) : "Someone who trusts you"} may need you to act`

  const leadLine = isTest
    ? `If this were a real alert, it would mean ${owner ? `<b style="color:#e2e8f0">${escapeHtml(owner)}</b>` : "the person who named you"} had stopped checking in with WalletLens — and this email would guide you through reaching their portfolio.`
    : `${owner ? `<b style="color:#e2e8f0">${escapeHtml(owner)}</b> named you` : "You were named"} as an heir in <b style="color:#4ade80">WalletLens Portfolio Guardian</b>, a safeguard that reaches out to you if they stop opening WalletLens. They have not checked in since <b>${lastSeen}</b>, so we're letting you know as they asked.`

  const html = emailShell(`
    ${testBanner}
    <h1 style="margin:0 0 18px;font-size:23px;line-height:1.3;color:#fff">${heading}</h1>
    <p style="margin:0 0 18px;line-height:1.7;color:#c4cdd6">${leadLine}</p>
    ${message ? `
    <div style="background:#141b12;border-left:3px solid #4ade80;padding:16px 20px;border-radius:0 10px 10px 0;margin:0 0 24px">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:.08em;color:#4ade80;font-weight:700;text-transform:uppercase">Their message to you</p>
      <p style="margin:0;line-height:1.8;color:#e6f2ea;font-style:italic;font-size:15px">"${escapeHtml(message)}"</p>
    </div>` : ""}
    <table role="presentation" style="width:100%;border-collapse:collapse;background:#0f141a;border:1px solid #1f2730;border-radius:12px;margin:0 0 24px">
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #1f2730;font-size:13px;color:#8a93a0">Portfolio value</td>
        <td style="padding:16px 20px;border-bottom:1px solid #1f2730;font-size:15px;color:#fff;font-weight:700;text-align:right">${valueStr}</td>
      </tr>
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #1f2730;font-size:13px;color:#8a93a0">Assets held</td>
        <td style="padding:16px 20px;border-bottom:1px solid #1f2730;font-size:14px;color:#e2e8f0;text-align:right">${assetStr}</td>
      </tr>
      <tr>
        <td style="padding:16px 20px;font-size:13px;color:#8a93a0">Last seen active</td>
        <td style="padding:16px 20px;font-size:14px;color:#e2e8f0;text-align:right">${lastSeen}</td>
      </tr>
    </table>
    <div style="background:#0f1a1b;border:1px solid #1f3d3a;border-radius:12px;padding:20px;margin:0 0 24px">
      <p style="margin:0 0 12px;font-weight:700;color:#4ade80;font-size:14px">How to access their portfolio</p>
      <ol style="margin:0;padding-left:20px;line-height:1.9;color:#b0bec5">
        <li>Find their <b style="color:#e2e8f0">WalletLens backup code</b> (starts with <code style="color:#4ade80">WLZ</code>) or a QR code — check their notes app, password manager, photos, printed documents or messages.</li>
        <li>Open <a href="https://walletlens.live" style="color:#4ade80;text-decoration:none">walletlens.live</a> on any phone, tablet or computer.</li>
        <li>Go to <b>Settings → Backup → Restore</b> and paste or scan the code.</li>
        <li>Their full portfolio appears instantly — no account, no password, nothing to sign up for.</li>
      </ol>
    </div>
    <p style="margin:0;line-height:1.7;color:#7d8794;font-size:13px">
      WalletLens keeps no financial data on its servers — everything lives on the owner's own device, which is why the backup code is what unlocks it. If you can't find one, check their devices for the WalletLens app or a saved browser bookmark.<br><br>
      Need a hand? Reach us at <a href="mailto:contact@walletlens.live" style="color:#4ade80">contact@walletlens.live</a>.
    </p>
  `)

  const subject = isTest
    ? "✅ Test: you're set up as a WalletLens heir"
    : `${owner ? owner + " — " : ""}an important WalletLens Portfolio Guardian alert`

  const waLines = [
    isTest ? "✅ WalletLens Portfolio Guardian — TEST (no action needed)" : "🛡️ WalletLens Portfolio Guardian",
    "",
    isTest
      ? `${owner ? owner : "Someone"} set you as an heir and is testing that we can reach you. Nothing has happened — they're fine.`
      : `${owner ? owner : "Someone who trusts you"} named you as an heir and has not opened WalletLens since ${lastSeen}.`,
    message ? `\nTheir message: "${message}"` : "",
    "",
    `Portfolio value: ${valueStr}`,
    `Assets: ${assetStr}`,
    "",
    "To access their portfolio, find their WalletLens backup code (starts with WLZ) or QR code, then open walletlens.live → Settings → Backup → Restore and paste/scan it.",
    "",
    "Questions? contact@walletlens.live",
  ]
  return { subject, html, whatsapp: waLines.filter(l => l !== undefined).join("\n") }
}

// ── Portfolio Guardian cron ───────────────────────────────────────────────
// Scans all guardian records every 6 h and notifies heirs (email + optional
// WhatsApp) when the user's check-in deadline has passed. Also callable via
// POST { mode:"guardian_cron_trigger" }.
async function runGuardianCron(): Promise<{ scanned: number; notified: number }> {
  const kv = await Deno.openKv()
  const now = Date.now()
  let scanned = 0, notified = 0
  for await (const entry of kv.list<Record<string, unknown>>({ prefix: ["guardian"] })) {
    scanned++
    const rec = entry.value
    if (!rec?.active || rec.notifiedAt) continue
    const lastCheckin = new Date(rec.lastCheckin as string).getTime()
    const intervalMs = (rec.intervalDays as number) * 24 * 60 * 60 * 1000
    if (now - lastCheckin < intervalMs) continue

    const ps = rec.portfolioSummary as { totalUsd: number; assetSymbols: string[]; currency: string }
    const valueStr = ps.totalUsd > 0
      ? `approximately ${ps.currency} ${ps.totalUsd.toLocaleString()}`
      : "an undisclosed amount"
    const assetStr = ps.assetSymbols.length > 0 ? ps.assetSymbols.join(", ") : "various assets"
    const lastSeen = new Date(rec.lastCheckin as string).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

    const { subject, html, whatsapp } = guardianContent({
      ownerName: rec.ownerName as string | undefined,
      message: (rec.message as string) || "",
      valueStr, assetStr, lastSeen,
      intervalDays: rec.intervalDays as number,
    })

    const heirs = rec.heirs as { name: string; email?: string; whatsapp?: string }[]
    for (const heir of heirs) {
      if (heir.email) await sendEmail(heir.email, subject, html, GUARDIAN_FROM)
      if (heir.whatsapp) await sendWhatsAppResult(heir.whatsapp, whatsapp)
    }
    await kv.set(entry.key, { ...rec, notifiedAt: new Date().toISOString() })
    notified++
  }
  console.log(`Guardian cron: scanned ${scanned}, notified ${notified}`)
  return { scanned, notified }
}

Deno.cron("guardian-sweep", "0 */6 * * *", async () => {
  try { await runGuardianCron() } catch (e) { console.error("Guardian cron failed:", e) }
})

// ── Per-IP rate limiting ────────────────────────────────────────────────────
// The AI modes are unauthenticated (CORS only stops browsers, not scripts) and
// each call spends real Anthropic API money. This in-memory limiter is per
// isolate — not a hard guarantee — but turns "free unlimited abuse" into
// "throttled abuse" at zero latency cost. Buckets: AI calls are expensive
// (tight limit), email-sending modes are spam vectors (very tight), the
// GET /proxy is cheap (loose).
const rlBuckets = new Map<string, { n: number; reset: number }>()
function rateLimited(ip: string, bucket: string, max: number, windowMs = 60_000): boolean {
  const key = bucket + ":" + ip
  const now = Date.now()
  const b = rlBuckets.get(key)
  if (!b || now > b.reset) {
    if (rlBuckets.size > 20_000) rlBuckets.clear()
    rlBuckets.set(key, { n: 1, reset: now + windowMs })
    return false
  }
  b.n++
  return b.n > max
}
const AI_MODES = new Set(["vision", "analyze", "assistant", "vision_advice", "recap"])
const EMAIL_MODES = new Set(["email", "guardian_setup", "guardian_test"])

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin")
  const headers = corsHeaders(origin)

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })

  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"


  // Server-side price proxy — GET /proxy?url=<allowlisted upstream>
  if (req.method === "GET") {
    const reqUrl = new URL(req.url)
    if (reqUrl.pathname === "/proxy") {
      if (rateLimited(ip, "proxy", 300)) {
        return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers })
      }
      return await handleProxy(reqUrl.searchParams.get("url"), headers)
    }
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers })
  }

  // deno-lint-ignore no-explicit-any
  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers })
  }

  // Throttle the expensive / abusable modes before any work happens.
  const mode = typeof body?.mode === "string" ? body.mode : "voice"
  if (AI_MODES.has(mode) || mode === "voice") {
    if (rateLimited(ip, "ai", 20)) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers })
    }
  } else if (EMAIL_MODES.has(mode)) {
    // Email-sending modes are spam vectors from our verified domain.
    if (rateLimited(ip, "mail", 5, 10 * 60_000)) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers })
    }
  } else if (rateLimited(ip, "misc", 60)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers })
  }

  // ── Newsletter / waitlist signup (mode: "email") ──────────────────────────
  // Stores an opted-in email in Deno KV (built into Deno Deploy, no setup).
  // No AI key required — runs even if ANTHROPIC_API_KEY is absent.
  if (body?.mode === "email") {
    const email = (body.email || "").toString().trim().toLowerCase()
    const source = (body.source || "landing").toString().slice(0, 60)
    // RFC-lite validation — good enough to reject obvious junk
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "invalid_email" }), { status: 400, headers })
    }
    try {
      const kv = await Deno.openKv()
      const key = ["signups", email]
      const existing = await kv.get(key)
      if (existing.value) {
        return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200, headers })
      }
      await kv.set(key, { email, source, at: new Date().toISOString() })
      // Maintain a running counter for quick totals
      await kv.atomic().sum(["signups_count"], 1n).commit()
      // Auto-send the welcome email from contact@walletlens.live (best-effort).
      sendEmail(email, "Welcome to WalletLens 🎉", WELCOME_HTML).catch(() => {})
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
    } catch (e) {
      console.error("KV signup error:", e)
      return new Response(JSON.stringify({ error: "storage_error" }), { status: 500, headers })
    }
  }

  // ── Export collected signups (mode: "email_export") ───────────────────────
  // Protected by the SIGNUP_EXPORT_TOKEN env secret. POST { mode, token }.
  // Returns every stored signup so the list can be downloaded into an ESP.
  if (body?.mode === "email_export") {
    const expected = Deno.env.get("SIGNUP_EXPORT_TOKEN")
    if (!expected || body.token !== expected) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers })
    }
    try {
      const kv = await Deno.openKv()
      const rows: unknown[] = []
      for await (const entry of kv.list({ prefix: ["signups"] })) {
        rows.push(entry.value)
      }
      return new Response(JSON.stringify({ ok: true, count: rows.length, signups: rows }), { status: 200, headers })
    } catch (e) {
      console.error("KV export error:", e)
      return new Response(JSON.stringify({ error: "storage_error" }), { status: 500, headers })
    }
  }

  // ── Send a campaign to all signups (mode: "send_campaign") ────────────────
  // Protected by SIGNUP_EXPORT_TOKEN. POST { mode, token, subject, html, test? }.
  // Sends from contact@walletlens.live via Resend, wrapped in the brand shell.
  // Pass `test: "you@email"` to send a single preview to yourself first.
  if (body?.mode === "send_campaign") {
    const expected = Deno.env.get("SIGNUP_EXPORT_TOKEN")
    if (!expected || body.token !== expected) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers })
    }
    if (!Deno.env.get("RESEND_API_KEY")) {
      return new Response(JSON.stringify({ error: "mail_not_configured" }), { status: 503, headers })
    }
    const subject = (body.subject || "").toString().trim()
    const inner = (body.html || "").toString()
    if (!subject || !inner) {
      return new Response(JSON.stringify({ error: "missing_subject_or_html" }), { status: 400, headers })
    }
    const html = emailShell(inner)

    // Preview mode — send only to the given test address.
    if (body.test) {
      const ok = await sendEmail(body.test.toString(), `[TEST] ${subject}`, html)
      return new Response(JSON.stringify({ ok, test: true }), { status: ok ? 200 : 502, headers })
    }

    try {
      const kv = await Deno.openKv()
      const recipients: string[] = []
      for await (const entry of kv.list<{ email: string }>({ prefix: ["signups"] })) {
        if (entry.value?.email) recipients.push(entry.value.email)
      }
      let sent = 0, failed = 0
      // Sequential with a tiny delay to stay under Resend's rate limit.
      for (const to of recipients) {
        const ok = await sendEmail(to, subject, html)
        ok ? sent++ : failed++
        await new Promise((r) => setTimeout(r, 120))
      }
      return new Response(JSON.stringify({ ok: true, total: recipients.length, sent, failed }), { status: 200, headers })
    } catch (e) {
      console.error("Campaign error:", e)
      return new Response(JSON.stringify({ error: "storage_error" }), { status: 500, headers })
    }
  }

  // ── Portfolio Guardian — Dead Man's Switch ───────────────────────────────
  // Lets users register heir email addresses. If they stop opening WalletLens
  // for longer than their chosen interval, the server emails the heirs with a
  // portfolio summary and a personal message.
  //
  // KV schema:
  //   ["guardian", deviceId]  → GuardianRecord
  //
  // GuardianRecord {
  //   deviceId: string          (anonymous — chosen by client)
  //   heirs: [{name, email}]    (up to 3)
  //   message: string           (personal message from user, max 500 chars)
  //   intervalDays: number      (30 | 60 | 90 | 180)
  //   portfolioSummary: {       (client-supplied at setup/checkin time)
  //     totalUsd: number,
  //     assetSymbols: string[]  (e.g. ["BTC","ETH","AAPL","Gold"])
  //     currency: string        (display currency code)
  //   }
  //   lastCheckin: string       (ISO timestamp)
  //   notifiedAt?: string       (ISO timestamp of heir notification, if sent)
  //   active: boolean
  // }
  //
  // No financial amounts beyond a rounded total are stored server-side.
  // The backup code never leaves the device.

  if (body?.mode === "guardian_setup") {
    // POST { mode:"guardian_setup", deviceId, ownerName?, heirs, message, intervalDays, portfolioSummary }
    const { deviceId, ownerName, heirs, message, intervalDays, portfolioSummary } = body

    // Validate deviceId — alphanumeric, 8-64 chars
    if (!deviceId || typeof deviceId !== "string" || !/^[a-zA-Z0-9_-]{8,64}$/.test(deviceId)) {
      return new Response(JSON.stringify({ error: "invalid_device_id" }), { status: 400, headers })
    }
    // Validate heirs array (1–3 items)
    if (!Array.isArray(heirs) || heirs.length === 0 || heirs.length > 3) {
      return new Response(JSON.stringify({ error: "invalid_heirs" }), { status: 400, headers })
    }
    const cleanHeirs = sanitizeHeirs(heirs)
    if (cleanHeirs.length === 0) {
      return new Response(JSON.stringify({ error: "no_valid_heirs" }), { status: 400, headers })
    }
    // Validate interval
    const validIntervals = [1, 7, 30, 60, 90, 180]
    const interval = validIntervals.includes(Number(intervalDays)) ? Number(intervalDays) : 90

    // Validate message + owner name
    const cleanMessage = String(message || "").trim().slice(0, 500)
    const cleanOwnerName = String(ownerName || "").trim().slice(0, 80)

    // Validate portfolio summary (optional but must be safe if provided)
    const summary = portfolioSummary && typeof portfolioSummary === "object"
      ? {
          totalUsd: typeof portfolioSummary.totalUsd === "number" ? Math.round(Math.abs(portfolioSummary.totalUsd)) : 0,
          assetSymbols: Array.isArray(portfolioSummary.assetSymbols)
            ? portfolioSummary.assetSymbols.slice(0, 20).map((s: unknown) => String(s).slice(0, 10)) : [],
          currency: String(portfolioSummary.currency || "USD").slice(0, 5).toUpperCase(),
        }
      : { totalUsd: 0, assetSymbols: [], currency: "USD" }

    try {
      const kv = await Deno.openKv()
      const record = {
        deviceId,
        ownerName: cleanOwnerName,
        heirs: cleanHeirs,
        message: cleanMessage,
        intervalDays: interval,
        portfolioSummary: summary,
        lastCheckin: new Date().toISOString(),
        notifiedAt: null,
        active: true,
      }
      await kv.set(["guardian", deviceId], record)
      return new Response(JSON.stringify({ ok: true, interval, heirCount: cleanHeirs.length }), { status: 200, headers })
    } catch (e) {
      console.error("Guardian setup error:", e)
      return new Response(JSON.stringify({ error: "storage_error" }), { status: 500, headers })
    }
  }

  if (body?.mode === "guardian_test") {
    // Immediately send a clearly-labeled TEST of the heir notification so the
    // owner can verify Portfolio Guardian works without waiting for the
    // interval. Uses the form data directly (no KV lookup needed).
    const { ownerName, heirs, message, portfolioSummary } = body
    const cleanHeirs = sanitizeHeirs(heirs)
    if (cleanHeirs.length === 0) {
      return new Response(JSON.stringify({ error: "no_valid_heirs" }), { status: 400, headers })
    }
    const cleanMessage = String(message || "").trim().slice(0, 500)
    const cleanOwnerName = String(ownerName || "").trim().slice(0, 80)
    // deno-lint-ignore no-explicit-any
    const ps: any = (portfolioSummary && typeof portfolioSummary === "object") ? portfolioSummary : {}
    const totalUsd = typeof ps.totalUsd === "number" ? Math.round(Math.abs(ps.totalUsd)) : 0
    const currency = String(ps.currency || "USD").slice(0, 5).toUpperCase()
    // deno-lint-ignore no-explicit-any
    const assetSymbols = Array.isArray(ps.assetSymbols) ? ps.assetSymbols.slice(0, 20).map((x: any) => String(x).slice(0, 10)) : []
    const valueStr = totalUsd > 0 ? `approximately ${currency} ${totalUsd.toLocaleString()}` : "an undisclosed amount"
    const assetStr = assetSymbols.length ? assetSymbols.join(", ") : "various assets"
    const lastSeen = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

    const { subject, html, whatsapp } = guardianContent({
      ownerName: cleanOwnerName, message: cleanMessage, valueStr, assetStr, lastSeen, isTest: true,
    })

    let sent = 0, failed = 0, waSent = 0, waFailed = 0
    let lastReason: string | null = null, lastWaReason: string | null = null
    for (const heir of cleanHeirs) {
      if (heir.email) {
        const r = await sendEmailResult(heir.email, subject, html, GUARDIAN_FROM)
        r.ok ? sent++ : (failed++, lastReason = r.reason)
      }
      if (heir.whatsapp) {
        const w = await sendWhatsAppResult(heir.whatsapp, whatsapp)
        w.ok ? waSent++ : (waFailed++, lastWaReason = w.reason)
      }
      await new Promise((res) => setTimeout(res, 120))
    }
    const anyEmail = cleanHeirs.some((h) => h.email)
    const anyWhatsapp = cleanHeirs.some((h) => h.whatsapp)
    // Success if every requested channel delivered at least once. When email was
    // requested but nothing went out, surface the concrete reason (mail not
    // configured, domain not verified, WhatsApp not configured, etc.).
    const emailOk = !anyEmail || sent > 0
    const waOk = !anyWhatsapp || waSent > 0
    if (!emailOk || !waOk) {
      return new Response(JSON.stringify({
        ok: false, sent, failed, waSent, waFailed,
        reason: (!emailOk ? lastReason : lastWaReason) || "send_failed",
      }), { status: 200, headers })
    }
    return new Response(JSON.stringify({ ok: true, sent, failed, waSent, waFailed, reason: lastReason || lastWaReason }), { status: 200, headers })
  }

  if (body?.mode === "guardian_checkin") {
    // POST { mode:"guardian_checkin", deviceId, portfolioSummary? }
    const { deviceId, portfolioSummary } = body
    if (!deviceId || typeof deviceId !== "string" || !/^[a-zA-Z0-9_-]{8,64}$/.test(deviceId)) {
      return new Response(JSON.stringify({ error: "invalid_device_id" }), { status: 400, headers })
    }
    try {
      const kv = await Deno.openKv()
      const entry = await kv.get<Record<string, unknown>>(["guardian", deviceId])
      if (!entry.value || !entry.value.active) {
        return new Response(JSON.stringify({ ok: false, reason: "not_found" }), { status: 200, headers })
      }
      const updated = { ...entry.value, lastCheckin: new Date().toISOString(), notifiedAt: null }
      // Optionally refresh the portfolio summary
      if (portfolioSummary && typeof portfolioSummary === "object") {
        updated.portfolioSummary = {
          totalUsd: typeof portfolioSummary.totalUsd === "number" ? Math.round(Math.abs(portfolioSummary.totalUsd)) : (entry.value.portfolioSummary as { totalUsd: number }).totalUsd,
          assetSymbols: Array.isArray(portfolioSummary.assetSymbols)
            ? portfolioSummary.assetSymbols.slice(0, 20).map((s: unknown) => String(s).slice(0, 10))
            : (entry.value.portfolioSummary as { assetSymbols: string[] }).assetSymbols,
          currency: String(portfolioSummary.currency || (entry.value.portfolioSummary as { currency: string }).currency || "USD").slice(0, 5).toUpperCase(),
        }
      }
      await kv.set(["guardian", deviceId], updated)
      return new Response(JSON.stringify({ ok: true, lastCheckin: updated.lastCheckin }), { status: 200, headers })
    } catch (e) {
      console.error("Guardian checkin error:", e)
      return new Response(JSON.stringify({ error: "storage_error" }), { status: 500, headers })
    }
  }

  if (body?.mode === "guardian_cancel") {
    // POST { mode:"guardian_cancel", deviceId }
    const { deviceId } = body
    if (!deviceId || typeof deviceId !== "string" || !/^[a-zA-Z0-9_-]{8,64}$/.test(deviceId)) {
      return new Response(JSON.stringify({ error: "invalid_device_id" }), { status: 400, headers })
    }
    try {
      const kv = await Deno.openKv()
      const entry = await kv.get<Record<string, unknown>>(["guardian", deviceId])
      if (entry.value) {
        await kv.set(["guardian", deviceId], { ...entry.value, active: false })
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
    } catch (e) {
      console.error("Guardian cancel error:", e)
      return new Response(JSON.stringify({ error: "storage_error" }), { status: 500, headers })
    }
  }
  // Manual admin trigger (protected)
  if (body?.mode === "guardian_cron_trigger") {
    const expected = Deno.env.get("SIGNUP_EXPORT_TOKEN")
    if (!expected || body.token !== expected) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers })
    }
    const result = await runGuardianCron()
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200, headers })
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "not_configured" }), { status: 503, headers })
  }

  // ── Screenshot import (mode: "vision") ────────────────────────────────────
  // Accepts a base64 image of a portfolio / trade history / order confirmation
  // and extracts holdings via Claude vision. Returns { ok, holdings: [...] }.
  if (body?.mode === "vision") {
    const image = (body.image || "").toString()
    const mediaType = (body.mediaType || "image/png").toString()
    if (!image) {
      return new Response(JSON.stringify({ error: "no_image" }), { status: 400, headers })
    }
    const prompt = `You are a precise data-extraction engine for a crypto/stock/metals portfolio app. The user uploaded a screenshot — it may be an exchange/wallet portfolio, a holdings list, a trade/order history, or a single order confirmation.

Extract EVERY asset position or trade you can read. Return STRICT JSON ONLY — a single JSON array, no markdown, no commentary. Each item:
{ "symbol": "BTC", "name": "Bitcoin", "amount": <number of units>, "price": <number, unit price in USD or 0 if not shown>, "type": "buy" | "sell" }

Rules:
- "amount" is the QUANTITY of units (coins/shares/oz), never the fiat value. If only a fiat value and a price are shown, divide to get units.
- If a row shows a holding/balance with no explicit buy/sell, use "buy".
- Use the ticker for "symbol" (BTC, ETH, SOL, AAPL, TSLA, XAU, …) in uppercase.
- Ignore totals, fiat cash balances, ads, and UI chrome. Only real asset positions/trades.
- If nothing can be read, return [].`
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
              { type: "text", text: prompt },
            ],
          }],
        }),
      })
      if (!resp.ok) {
        const err = await resp.text()
        console.error("Claude API error (vision):", resp.status, err)
        return new Response(JSON.stringify({ error: "upstream_error", status: resp.status }), { status: 502, headers })
      }
      const data = await resp.json()
      const text = data.content?.[0]?.text || ""
      const match = text.match(/\[[\s\S]*\]/)
      const holdings = match ? JSON.parse(match[0]) : []
      return new Response(JSON.stringify({ ok: true, holdings }), { headers })
    } catch (e) {
      console.error("vision error:", e)
      return new Response(JSON.stringify({ error: "parse_error", message: String(e) }), { status: 500, headers })
    }
  }

  // ── Magic Indicator AI verdict (mode: "analyze") ──────────────────────────
  if (body?.mode === "analyze") {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 700,
          messages: [{ role: "user", content: buildAnalyzePrompt(body) }],
        }),
      })
      if (!resp.ok) {
        const err = await resp.text()
        console.error("Claude API error (analyze):", resp.status, err)
        return new Response(JSON.stringify({ error: "upstream_error", status: resp.status }), { status: 502, headers })
      }
      const data = await resp.json()
      const text = data.content?.[0]?.text || ""
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error("no JSON in response")
      const verdict = JSON.parse(match[0])
      return new Response(JSON.stringify({ ok: true, verdict }), { headers })
    } catch (e) {
      console.error("analyze error:", e)
      return new Response(JSON.stringify({ error: "parse_error", message: String(e) }), { status: 500, headers })
    }
  }

  // ── In-app assistant (mode: "assistant") ──────────────────────────────────
  // Accepts a short chat history and returns Claude Haiku's reply. The reply
  // may contain [[nav:/route|Label]] markers the client renders as buttons.
  if (body?.mode === "assistant") {
    const lang = body.lang === "ar" ? "ar" : "en"
    // deno-lint-ignore no-explicit-any
    const rawMsgs = Array.isArray(body.messages) ? body.messages : []
    const messages = rawMsgs
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-12) // cap history
      .map((m: any) => ({ role: m.role, content: m.content.toString().slice(0, 2000) }))
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      return new Response(JSON.stringify({ error: "no_message" }), { status: 400, headers })
    }
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          system: buildAssistantSystem(lang),
          messages,
        }),
      })
      if (!resp.ok) {
        const err = await resp.text()
        console.error("Claude API error (assistant):", resp.status, err)
        return new Response(JSON.stringify({ error: "upstream_error", status: resp.status }), { status: 502, headers })
      }
      const data = await resp.json()
      const reply = data.content?.[0]?.text || ""
      return new Response(JSON.stringify({ ok: true, reply }), { headers })
    } catch (e) {
      console.error("assistant error:", e)
      return new Response(JSON.stringify({ error: "parse_error", message: String(e) }), { status: 500, headers })
    }
  }

  // ── Portfolio Vision advice (mode: "vision_advice") ───────────────────────
  if (body?.mode === "vision_advice") {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 900,
          messages: [{ role: "user", content: buildVisionAdvicePrompt(body) }],
        }),
      })
      if (!resp.ok) {
        const err = await resp.text()
        console.error("Claude API error (vision_advice):", resp.status, err)
        return new Response(JSON.stringify({ error: "upstream_error", status: resp.status }), { status: 502, headers })
      }
      const data = await resp.json()
      const text = data.content?.[0]?.text || ""
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error("no JSON in response")
      const advice = JSON.parse(match[0])
      return new Response(JSON.stringify({ ok: true, advice }), { headers })
    } catch (e) {
      console.error("vision_advice error:", e)
      return new Response(JSON.stringify({ error: "parse_error", message: String(e) }), { status: 500, headers })
    }
  }

  // ── Daily market recap (mode: "recap") ────────────────────────────────────
  if (body?.mode === "recap") {
    const snapshotText = (body.snapshotText || "").toString().slice(0, 2000)
    const dateStr = (body.date || "").toString().slice(0, 40)
    const year = Number(body.year) || new Date().getUTCFullYear()
    if (!snapshotText || !dateStr) {
      return new Response(JSON.stringify({ error: "missing_snapshot_or_date" }), { status: 400, headers })
    }
    try {
      const { system, prompt } = buildRecapPrompt(snapshotText, dateStr, year)
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 3000,
          system,
          messages: [{ role: "user", content: prompt }],
        }),
      })
      if (!resp.ok) {
        const err = await resp.text()
        console.error("Claude API error (recap):", resp.status, err)
        return new Response(JSON.stringify({ error: "upstream_error", status: resp.status }), { status: 502, headers })
      }
      const data = await resp.json()
      let out = (data.content?.[0]?.text || "")
      const tStart = out.indexOf("TITLE:")
      if (tStart === -1) throw new Error("no TITLE: header")
      out = out.slice(tStart)
      const bodyIdx = out.indexOf("\nBODY:")
      if (bodyIdx === -1) throw new Error("no BODY: marker")
      const headerText = out.slice(0, bodyIdx)
      let content = out.slice(bodyIdx + "\nBODY:".length).replace(/^\r?\n/, "")
      content = content.replace(/^```[a-z]*\s*\n/i, "").replace(/\n?```\s*$/i, "").trim()
      const field = (name: string) => {
        const m = headerText.match(new RegExp("^" + name + ":\\s*(.+)$", "mi"))
        return m ? m[1].trim() : ""
      }
      const title = field("TITLE")
      const summary = field("SUMMARY")
      const readTime = field("READTIME") || "4 min read"
      if (!title || !content || content.length < 400) throw new Error("recap too short")
      return new Response(JSON.stringify({ ok: true, title, summary, readTime, content }), { headers })
    } catch (e) {
      console.error("recap error:", e)
      return new Response(JSON.stringify({ error: "parse_error", message: String(e) }), { status: 500, headers })
    }
  }

  const transcript = (body.transcript || "").toString().trim().slice(0, 500)
  if (!transcript) {
    return new Response(JSON.stringify({ error: "no_transcript" }), { status: 400, headers })
  }
  const hintLang = body.hintLang === "ar" ? "ar" : "en"
  // Optional candidate transcripts from the other recognizers, de-duped.
  const alternatives = Array.isArray(body.alternatives)
    ? Array.from(new Set(
        (body.alternatives as unknown[])
          .map((a) => (a || "").toString().trim().slice(0, 500))
          .filter((a) => a.length > 0),
      )).slice(0, 8)
    : []
  if (!alternatives.includes(transcript)) alternatives.unshift(transcript)

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        // Higher cap so long multi-trade JSON is never truncated (which would
        // silently drop trades). Prefill "{" forces clean JSON with no preamble.
        max_tokens: 1500,
        messages: [
          { role: "user", content: buildPrompt(transcript, hintLang, alternatives) },
          { role: "assistant", content: "{" },
        ],
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error("Claude API error:", resp.status, err)
      return new Response(JSON.stringify({ error: "upstream_error", status: resp.status }), { status: 502, headers })
    }

    const data = await resp.json()
    // Re-attach the prefilled "{" so we parse the full JSON object.
    const text = "{" + (data.content?.[0]?.text || "")
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("no JSON in response")
    const trades = filterTrades(JSON.parse(match[0]).trades)
    return new Response(JSON.stringify({ ok: true, trades }), { headers })
  } catch (e) {
    console.error("voice-parse error:", e)
    return new Response(JSON.stringify({ error: "parse_error", message: String(e) }), { status: 500, headers })
  }
})
