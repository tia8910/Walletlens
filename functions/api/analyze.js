/**
 * Cloudflare Pages Function — /api/analyze
 * Calls Claude to analyse a user's crypto portfolio and return
 * actionable advice. The ANTHROPIC_API_KEY is a Cloudflare env secret
 * set once by the site owner — end users never see or enter it.
 */

export async function onRequestPost(context) {
  const { env, request } = context

  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'not_configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'bad_request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const { holdings = [], totalValue = 0, totalInvested = 0, momentum = 0, sentiment = 'balanced' } = body

  if (!holdings.length) {
    return new Response(JSON.stringify({ error: 'no_holdings' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const holdingLines = holdings.map(h =>
    `• ${h.sym}: ${h.w.toFixed(1)}% of portfolio ($${h.value.toLocaleString()}), P&L ${h.pnlPct >= 0 ? '+' : ''}${h.pnlPct.toFixed(1)}%, 24h change ${h.chg24h >= 0 ? '+' : ''}${h.chg24h.toFixed(1)}%`
  ).join('\n')

  const prompt = `You are WalletLens AI, a sharp crypto portfolio advisor. Analyse this user's portfolio and give direct, specific, actionable advice for TODAY.

Portfolio overview:
- Total value: $${totalValue.toLocaleString()}
- Total invested: $${totalInvested.toLocaleString()}
- Overall P&L: ${totalValue >= totalInvested ? '+' : ''}${((totalValue - totalInvested) / Math.max(totalInvested, 1) * 100).toFixed(1)}%
- Weighted 24h momentum: ${momentum >= 0 ? '+' : ''}${momentum.toFixed(1)}%
- Trading sentiment: ${sentiment}

Holdings:
${holdingLines}

Respond with a JSON object ONLY (no markdown, no explanation outside the JSON):
{
  "headline": "one punchy sentence — what should they do RIGHT NOW",
  "summary": "2-3 sentences of context explaining the reasoning behind the headline",
  "overallColor": "#hexcolor (green=#34d399 for bullish, red=#f87171 for danger, yellow=#fbbf24 for caution, purple=#a78bfa for neutral)",
  "confidence": <number 50-95>,
  "assetActions": [
    {
      "sym": "SYMBOL",
      "action": "HOLD|ADD|TRIM|SELL|WATCH",
      "actionColor": "#hexcolor",
      "reasons": ["concise reason 1", "concise reason 2"],
      "score": <number -5 to 5>
    }
  ],
  "tip": "one specific insight or market observation the user probably doesn't know"
}`

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
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error('Claude API error:', resp.status, err)
      return new Response(JSON.stringify({ error: 'upstream_error', status: resp.status }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const data = await resp.json()
    const text = data.content?.[0]?.text || ''

    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no JSON in response')

    const analysis = JSON.parse(jsonMatch[0])

    // Merge in original asset data (weight, pnlPct, chg24h, coin_image)
    if (Array.isArray(analysis.assetActions)) {
      analysis.assetActions = analysis.assetActions.map(a => {
        const orig = holdings.find(h => h.sym === a.sym) || {}
        return { ...orig, ...a }
      })
    }

    return new Response(JSON.stringify({ ok: true, analysis }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (e) {
    console.error('analyze function error:', e)
    return new Response(JSON.stringify({ error: 'parse_error', message: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
