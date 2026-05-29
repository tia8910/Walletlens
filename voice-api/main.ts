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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Content-Type": "application/json",
  }
}

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
    { "type": "buy" | "sell", "symbol": "BTC", "name": "Bitcoin", "amount": <number>, "price": <number or null> }
  ]
}

Rules:
- MULTIPLE trades in one sentence → one object PER asset. "I bought 1 Bitcoin and 1 Ethereum" → [{buy BTC 1},{buy ETH 1}]. "اشتريت واحد بيتكوين وواحد ايثيريوم" → the same two. One intent verb governs every coin listed after it — apply to each.
- A shared amount before a list applies to each unless a per-coin amount is given: "2 Solana and 3 Cardano" → [SOL×2, ADA×3]; "5 of Bitcoin and Ethereum" → [BTC×5, ETH×5].
- Arabic "و" (and) separates assets: "بيتكوين وايثيريوم" = two assets.
- Too garbled to extract any trade → { "trades": [] }.
- Arabic intent verbs: اشتري/شريت/جبت/أخذت/حطيت/كومت/جمعت/استثمرت = BUY; بعت/بيع/صفيت/سحبت/خرجت/جنيت = SELL.
- Amount slang: "5K"/"5 grand" = 5000; "2 mil" = 2,000,000; "half"/"نص" = 0.5; "quarter"/"ربع" = 0.25; الف=1000, مليون=1,000,000.
- Coin mis-hearings: Selena/Salina = Solana; "a theorem"/"etherium" = Ethereum; "big point"/"bit corn" = Bitcoin; "polka dot" = Polkadot; "chain link" = Chainlink; "ava lunch" = Avalanche; "throne" = TRON; "dough"/"doggie coin" = Dogecoin; "ripple" = XRP.
- Stocks: Apple=AAPL, Tesla=TSLA, Microsoft=MSFT, NVIDIA=NVDA, Google=GOOGL, Amazon=AMZN, Meta=META, Palantir=PLTR, Coinbase=COIN, Robinhood=HOOD.
- Metals: gold=XAU, silver=XAG, platinum=XPT, copper=HG.
- A coin with no clear buy/sell intent → skip it, don't invent one.`
}

// deno-lint-ignore no-explicit-any
function filterTrades(arr: any): any[] {
  return Array.isArray(arr)
    ? arr.filter((t) =>
      t && (t.type === "buy" || t.type === "sell") && t.symbol &&
      typeof t.amount === "number" && t.amount > 0
    )
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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers })
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "not_configured" }), { status: 503, headers })
  }

  // deno-lint-ignore no-explicit-any
  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers })
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
        max_tokens: 900,
        messages: [{ role: "user", content: buildPrompt(transcript, hintLang, alternatives) }],
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error("Claude API error:", resp.status, err)
      return new Response(JSON.stringify({ error: "upstream_error", status: resp.status }), { status: 502, headers })
    }

    const data = await resp.json()
    const text = data.content?.[0]?.text || ""
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("no JSON in response")
    const trades = filterTrades(JSON.parse(match[0]).trades)
    return new Response(JSON.stringify({ ok: true, trades }), { headers })
  } catch (e) {
    console.error("voice-parse error:", e)
    return new Response(JSON.stringify({ error: "parse_error", message: String(e) }), { status: 500, headers })
  }
})
