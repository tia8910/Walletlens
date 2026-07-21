/**
 * Serverless function — /api/analyze
 * Calls Claude to analyse a user's crypto portfolio and return
 * actionable advice. The ANTHROPIC_API_KEY is an env secret
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

  // ── Growth-plan mode: the client sends a synthesized profile + Monte-Carlo
  // results; Claude writes the personalized multi-year strategy. All inputs
  // are numbers/enums sanitized here — no free-form user text reaches the prompt.
  if (body.mode === 'growth_plan') {
    return handleGrowthPlan(body, apiKey)
  }

  const { holdings = [], totalValue = 0, totalInvested = 0, momentum = 0, sentiment = 'balanced' } = body

  if (!Array.isArray(holdings) || !holdings.length) {
    return new Response(JSON.stringify({ error: 'no_holdings' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // Cap holdings count and sanitize each field to prevent prompt injection.
  const safeHoldings = holdings.slice(0, 50).map(h => ({
    sym:    String(h.sym    || '').replace(/[^\w./-]/g, '').slice(0, 10) || 'UNKNOWN',
    w:      Math.max(0, Math.min(100, Number(h.w)     || 0)),
    value:  Math.max(0, Number(h.value)   || 0),
    pnlPct: Math.max(-999, Math.min(9999, Number(h.pnlPct) || 0)),
    chg24h: Math.max(-999, Math.min(9999, Number(h.chg24h) || 0)),
  }))

  const holdingLines = safeHoldings.map(h =>
    `• ${h.sym}: ${h.w.toFixed(1)}% of portfolio ($${h.value.toLocaleString()}), P&L ${h.pnlPct >= 0 ? '+' : ''}${h.pnlPct.toFixed(1)}%, 24h change ${h.chg24h >= 0 ? '+' : ''}${h.chg24h.toFixed(1)}%`
  ).join('\n')

  const safeTotal     = Math.max(0, Number(totalValue)    || 0)
  const safeInvested  = Math.max(0, Number(totalInvested) || 0)
  const safeMomentum  = Math.max(-999, Math.min(999, Number(momentum) || 0))
  const safeSentiment = ['bullish', 'bearish', 'balanced', 'fearful', 'greedy'].includes(sentiment) ? sentiment : 'balanced'

  const prompt = `You are WalletLens AI, a sharp crypto portfolio advisor. Analyse this user's portfolio and give direct, specific, actionable advice for TODAY.

Portfolio overview:
- Total value: $${safeTotal.toLocaleString()}
- Total invested: $${safeInvested.toLocaleString()}
- Overall P&L: ${safeTotal >= safeInvested ? '+' : ''}${((safeTotal - safeInvested) / Math.max(safeInvested, 1) * 100).toFixed(1)}%
- Weighted 24h momentum: ${safeMomentum >= 0 ? '+' : ''}${safeMomentum.toFixed(1)}%
- Trading sentiment: ${safeSentiment}

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

    // Merge safe original asset data (weight, pnlPct, chg24h) back in.
    if (Array.isArray(analysis.assetActions)) {
      analysis.assetActions = analysis.assetActions.map(a => {
        const orig = safeHoldings.find(h => h.sym === a.sym) || {}
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

/* ── growth_plan mode ─────────────────────────────────────────────────── */
async function handleGrowthPlan(body, apiKey) {
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })

  const num = (v, lo, hi, d = 0) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d
  }

  const totalValue = num(body.totalValue, 0, 1e12)
  const pnlPct     = num(body.pnlPct, -100, 1e5)
  const monthly    = num(body.monthly, 0, 1e7)
  const goal       = num(body.goal, 0, 1e12)
  const months     = num(body.months, 1, 600, 120)
  const expReturn  = num(body.expReturn, -0.5, 2)
  const vol        = num(body.vol, 0, 3)
  const p10        = num(body.p10, 0, 1e13)
  const p50        = num(body.p50, 0, 1e13)
  const p90        = num(body.p90, 0, 1e13)
  const probGoal   = num(body.probGoal, 0, 1)
  const topShare   = num(body.topShare, 0, 1)
  const dryPowder  = num(body.dryPowder, 0, 1)
  const risk      = ['aggressive','growth','balanced','conservative'].includes(body.risk) ? body.risk : 'balanced'
  const behaviour = ['dca','occasional','lump'].includes(body.behaviour) ? body.behaviour : 'occasional'

  const CLASSES = ['crypto_large','crypto_small','stocks','metals','realestate','cash']
  const weights = CLASSES
    .map(c => ({ c, w: num(body.weights?.[c], 0, 1) }))
    .filter(x => x.w > 0.005)
    .map(x => `${x.c.replace('_', ' ')} ${(x.w * 100).toFixed(0)}%`)
    .join(', ') || 'unknown'

  const levers = Array.isArray(body.levers)
    ? body.levers.slice(0, 5).map(l =>
        `• ${String(l.label || '').replace(/[^\w\s$%()→./+-]/g, '').slice(0, 90)}: ${String(l.detail || '').replace(/[^\w\s$%()→./+,-]/g, '').slice(0, 120)}`
      ).join('\n')
    : ''

  const prompt = `You are WalletLens AI, a wealth-building strategist. A Monte-Carlo simulation of the user's REAL portfolio has already been run — your job is to turn it into a personal, motivating, specific growth plan. Do not invent numbers; use the ones given.

User profile:
- Net worth: $${totalValue.toLocaleString()} (P&L ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% overall)
- Allocation: ${weights}
- Risk posture: ${risk}; largest single position ${(topShare * 100).toFixed(0)}% of portfolio; cash/stables ${(dryPowder * 100).toFixed(0)}%
- Investing behaviour: ${behaviour === 'dca' ? 'consistent DCA' : behaviour === 'lump' ? 'lump-sum buyer' : 'occasional buyer'}
- Contributing $${monthly.toLocaleString()}/month; goal $${goal.toLocaleString()} within ${(months / 12).toFixed(1)} years

Simulation results (400 paths of their actual mix, ${(expReturn * 100).toFixed(1)}%/yr expected, ${(vol * 100).toFixed(0)}% volatility):
- Median outcome $${p50.toLocaleString()}; pessimistic (P10) $${p10.toLocaleString()}; optimistic (P90) $${p90.toLocaleString()}
- Probability of reaching the goal: ${(probGoal * 100).toFixed(0)}%
${levers ? `\nRanked levers (computed by re-simulation):\n${levers}` : ''}

Respond with a JSON object ONLY:
{
  "headline": "one direct sentence: are they on track, and the single most important thing to do",
  "narrative": "2-3 sentences interpreting the simulation for THEM — reference their actual mix, behaviour and odds",
  "actions": ["4 specific, ordered actions with concrete numbers where possible (use the levers)", "…"],
  "milestoneNote": "one motivating sentence about their next net-worth milestone"
}`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!resp.ok) return json({ error: 'upstream_error', status: resp.status }, 502)
    const data = await resp.json()
    const text = data.content?.[0]?.text || ''
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no JSON in response')
    const plan = JSON.parse(m[0])
    return json({ ok: true, plan })
  } catch (e) {
    console.error('growth_plan error:', e)
    return json({ error: 'parse_error', message: e.message }, 500)
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
