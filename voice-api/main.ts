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

function corsHeaders(origin: string | null): HeadersInit {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://walletlens.live"
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
      headers: { "Accept": "application/json, text/csv, */*", "User-Agent": "WalletLens-Proxy/1.0" },
      signal: AbortSignal.timeout(8000),
    })
    const text = await upstream.text()
    const ct = upstream.headers.get("content-type") || "application/json"
    return new Response(text, {
      status: upstream.status,
      headers: { ...headers, "Content-Type": ct, "Cache-Control": "public, max-age=30" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: "upstream_failed", detail: String(e) }), { status: 502, headers })
  }
}

// ── Email sending (Resend) ──────────────────────────────────────────────────
// All mail goes out from contact@walletlens.live. Requires the RESEND_API_KEY
// env secret and a verified walletlens.live domain in the Resend dashboard.
const MAIL_FROM = "WalletLens <contact@walletlens.live>"

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY")
  if (!key) return false
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ from: MAIL_FROM, to, subject, html, reply_to: "contact@walletlens.live" }),
    })
    if (!resp.ok) console.error("Resend error:", resp.status, await resp.text())
    return resp.ok
  } catch (e) {
    console.error("Resend exception:", e)
    return false
  }
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

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin")
  const headers = corsHeaders(origin)

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })

  // Server-side price proxy — GET /proxy?url=<allowlisted upstream>
  if (req.method === "GET") {
    const reqUrl = new URL(req.url)
    if (reqUrl.pathname === "/proxy") {
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
