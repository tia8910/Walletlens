// AI advisor for the Portfolio Vision page.
//
// Sends a compact summary of the user's planning buckets + asset-class mix to
// the owner-hosted Deno endpoint (same one that powers voice import / analysis,
// holding the Anthropic key server-side) and gets back structured, prioritised
// planning advice. The portfolio summary is rounded and symbol-only — no raw
// transaction data leaves the device. Fully optional: any failure returns null
// and the UI simply hides the advisor.

const DEFAULT_VOICE_API = 'https://walletlens-voice-parse.tia8910.deno.net/'

function endpoint() {
  try {
    const o = localStorage.getItem('wl_voice_api')
    if (o && o.trim()) return o.trim()
  } catch {}
  return DEFAULT_VOICE_API
}

function sanitizeAdvice(a) {
  if (!a || typeof a !== 'object') return null
  const str = (x, n = 200) => (typeof x === 'string' ? x.slice(0, n) : '')
  const lvl = (x) => (['good', 'warn', 'tip'].includes(x) ? x : 'tip')
  const insights = Array.isArray(a.insights)
    ? a.insights.slice(0, 6).map(i => ({
        title: str(i?.title, 60),
        detail: str(i?.detail, 280),
        level: lvl(i?.level),
      })).filter(i => i.title || i.detail)
    : []
  const actions = Array.isArray(a.actions)
    ? a.actions.map(s => str(s, 200)).filter(Boolean).slice(0, 4)
    : []
  const headline = str(a.headline, 140)
  if (!headline && !insights.length && !actions.length) return null
  let score = Number(a.score)
  if (!Number.isFinite(score)) score = null
  else score = Math.max(0, Math.min(100, Math.round(score)))
  return { headline, score, insights, actions }
}

// payload = { netWorth, currency, categories:[{name,value,pct}],
//             buckets:[{name,type,current,target,monthlyContribution,
//             monthlyWithdrawal,targetMonths,categories,pctOfNW}],
//             monthly:{in,out,net} }
export async function getVisionAdvice(payload) {
  try {
    const resp = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'vision_advice', ...payload }),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return sanitizeAdvice(data?.advice)
  } catch {
    return null
  }
}
