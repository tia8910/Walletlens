// Optional AI verdict for the Magic Indicator.
//
// Sends the already-computed numeric pillars + key stats to the owner-hosted
// Deno endpoint (the same one that powers voice import, holding the Anthropic
// key server-side) and gets back a concise natural-language direction. The LLM
// does NOT fetch live on-chain data — it reasons over the numbers we send plus
// its own knowledge of the asset. Fully optional: any failure returns null and
// the UI simply shows the deterministic indicator alone.

const DEFAULT_VOICE_API = 'https://walletlens-voice-parse.tia8910.deno.net/'

function endpoint() {
  try {
    const o = localStorage.getItem('wl_voice_api')
    if (o && o.trim()) return o.trim()
  } catch {}
  return DEFAULT_VOICE_API
}

const CACHE_KEY = 'crypto_tracker_ai_verdict_cache_v1'
const TTL_MS = 60 * 60 * 1000 // 1h — verdicts track the (hourly-cached) pillars

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function writeCache(c) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch {}
}

function sanitizeVerdict(v) {
  if (!v || typeof v !== 'object') return null
  const arr = (x) => (Array.isArray(x) ? x.map(s => String(s)).filter(Boolean).slice(0, 4) : [])
  const dir = typeof v.direction === 'string' ? v.direction : null
  const oneLiner = typeof v.oneLiner === 'string' ? v.oneLiner : ''
  if (!dir && !oneLiner) return null
  return {
    direction: dir,
    oneLiner,
    bull: arr(v.bull),
    bear: arr(v.bear),
    action: typeof v.action === 'string' ? v.action : '',
  }
}

// Returns a verdict object or null. `coinId` is used only as a cache key.
// `payload` = { asset:{symbol,name}, magic:{score,direction,confidence}, pillars:[...], stats:{...} }
export async function getAiVerdict(coinId, payload, { force = false } = {}) {
  const cache = readCache()
  const hit = cache[coinId]
  if (!force && hit && Date.now() - hit.t < TTL_MS && hit.v) return hit.v

  try {
    const resp = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'analyze', ...payload }),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const verdict = sanitizeVerdict(data?.verdict)
    if (verdict) {
      cache[coinId] = { t: Date.now(), v: verdict }
      writeCache(cache)
    }
    return verdict
  } catch {
    return null
  }
}
