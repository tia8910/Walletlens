/**
 * Serverless function — /api/voice-parse
 *
 * Multilingual voice-trade interpreter. Takes a raw speech-to-text transcript
 * (any language — Arabic dialects, English, mixed) and returns one or more
 * structured trades. Used as a fallback when the local regex parser can't
 * extract a complete trade from the transcript (e.g. Arabic captured by an
 * English-only STT engine, slang the local vocab doesn't know, or multi-trade
 * sentences split awkwardly).
 *
 * Request body:
 *   { transcript: string, hintLang?: 'en'|'ar' }
 *
 * Response body:
 *   { ok: true, trades: [ { type: 'buy'|'sell', symbol, name?, amount, price? } ] }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function onRequestPost(context) {
  const { env, request } = context

  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: CORS })
  }

  let body
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: CORS })
  }

  const transcript = (body.transcript || '').toString().trim().slice(0, 500)
  if (!transcript) {
    return new Response(JSON.stringify({ error: 'no_transcript' }), { status: 400, headers: CORS })
  }
  const hintLang = body.hintLang === 'ar' ? 'ar' : 'en'

  const prompt = `You are a voice-trade interpreter for a crypto/stock portfolio app.

The user spoke into their microphone and the speech-to-text engine produced this raw transcript. The engine may have mis-heard words, mixed languages, or transcribed Arabic speech phonetically as English (e.g. "اشتري واحد بيتكوين" might become "street ultra bitcoin"). Slang/dialect is common: Saudi, Egyptian, Levantine, Maghrebi Arabic; English crypto-trader slang like "aped", "hodl", "scoop", "yolo'd", "tp'd", "rugged".

Transcript hint language: ${hintLang}

Transcript: "${transcript}"

Extract every TRADE the user described. Return STRICT JSON ONLY — no markdown fences, no commentary outside the JSON. Use this shape:

{
  "trades": [
    {
      "type": "buy" | "sell",
      "symbol": "BTC" | "ETH" | "SOL" | "AAPL" | "TSLA" | "XAU" | etc. (uppercase ticker the asset is commonly known by),
      "name": "Bitcoin" | "Solana" | "Apple" | etc. (full readable name),
      "amount": <number, the QUANTITY of units bought/sold>,
      "price": <number or null — only if a unit price was explicitly stated>
    }
  ]
}

Rules:
- MULTIPLE trades in one sentence → one object PER asset. "I bought 5 Selena and 1 Bitcoin" → [SOL × 5, BTC × 1]. "I bought 1 Bitcoin and 1 Ethereum" → [BTC × 1, ETH × 1]. "اشتريت واحد بيتكوين وواحد ايثيريوم" → the same two trades. A single intent verb governs every coin listed after it — apply it to each.
- A shared amount before a list applies to each coin unless a per-coin amount is given: "I bought 5 of Bitcoin and Ethereum" → [BTC × 5, ETH × 5]; "I bought 2 Solana and 3 Cardano" → [SOL × 2, ADA × 3].
- The Arabic conjunction "و" (and) separates assets: "بيتكوين وايثيريوم" = Bitcoin AND Ethereum (two assets).
- If the transcript is too garbled to extract ANY trade, return { "trades": [] }.
- Recognise Arabic phonetics that English STT mis-rendered (e.g. "selena" = Solana, "street ultra" or "ash tara" or "ish tari" = اشتري = buy, "baat" / "bat" / "bait" = بعت = sold).
- Arabic dialect intent verbs: اشتري/شريت/جبت/أخذت/حطيت/كومت/جمعت/كسبت/استثمرت = BUY; بعت/بيع/صفيت/سحبت/كسرت/خرجت/طرحت/جنيت = SELL.
- Amount slang: "5K" or "5 grand" / "5 racks" / "5 stack" = 5000; "2 mil" = 2,000,000; "half" = 0.5; "quarter" = 0.25.
- Common STT mis-hearings of coins: Selena/Salina/Celina = Solana; "a theorem" / "etherium" = Ethereum; "big point" / "bit corn" = Bitcoin; "polka dot" = Polkadot; "chain link" / "jane link" = Chainlink; "ava lunch" = Avalanche; "throne" = TRON; "dough" / "doggie coin" = Dogecoin.
- Stocks: Apple = AAPL, Tesla = TSLA, Microsoft = MSFT, NVIDIA = NVDA, Google = GOOGL, Amazon = AMZN, Meta = META, Palantir = PLTR, Coinbase = COIN, Robinhood = HOOD.
- Metals: gold = XAU, silver = XAG, platinum = XPT, copper = HG.
- If the user only mentioned a coin without a clear buy/sell intent, do NOT invent one — skip that trade.`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error('Claude API error:', resp.status, err)
      return new Response(JSON.stringify({ error: 'upstream_error', status: resp.status }), { status: 502, headers: CORS })
    }

    const data = await resp.json()
    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no JSON in response')
    const parsed = JSON.parse(jsonMatch[0])
    const trades = Array.isArray(parsed.trades) ? parsed.trades.filter(t =>
      t && (t.type === 'buy' || t.type === 'sell') && t.symbol && typeof t.amount === 'number' && t.amount > 0
    ) : []

    return new Response(JSON.stringify({ ok: true, trades }), { headers: CORS })
  } catch (e) {
    console.error('voice-parse error:', e)
    return new Response(JSON.stringify({ error: 'parse_error', message: e.message }), { status: 500, headers: CORS })
  }
}
