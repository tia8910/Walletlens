// WalletLens in-app assistant (client side, Claude Haiku via owner proxy).
//
// A lightweight chat helper that understands the app's feature map and points
// the user to the right page/tab for what they want to do. The Anthropic key is
// NEVER in the browser — requests go to the owner-hosted serverless endpoint
// (the same Deno proxy that powers voice/vision import) which holds the
// ANTHROPIC_API_KEY secret server-side and calls Haiku. End users never enter a
// key. If the proxy is unreachable/unconfigured the UI shows a friendly error.

// Owner-hosted proxy that holds the secret. Overridable at runtime (without a
// rebuild) via localStorage 'wl_voice_api' — shared with the voice/vision flow.
const DEFAULT_PROXY = 'https://walletlens-voice-parse.tia8910.deno.net/'
function proxyEndpoint() {
  try {
    const o = localStorage.getItem('wl_voice_api')
    if (o && o.trim()) return o.trim()
  } catch {}
  return DEFAULT_PROXY
}

// Canonical feature map (kept client-side only for reference/labels — the
// authoritative system prompt lives in the proxy so the key stays server-side).
export const FEATURES = [
  { route: '/dashboard',             label: 'Dashboard' },
  { route: '/dashboard?tab=ai',      label: 'AI Analysis' },
  { route: '/dashboard?tab=targets', label: 'Sell Targets' },
  { route: '/dashboard?tab=alerts',  label: 'Price Alerts' },
  { route: '/dashboard?tab=manage',  label: 'Wallets & Backup' },
  { route: '/transactions',          label: 'Transactions' },
  { route: '/market',                label: 'Market' },
  { route: '/whales',                label: 'Whale Tracker' },
  { route: '/alpha',                 label: 'Alpha' },
  { route: '/coach',                 label: 'Coach' },
  { route: '/technicals',            label: 'Technicals' },
  { route: '/academy',               label: 'Academy' },
  { route: '/settings',              label: 'Settings' },
]

// messages: [{ role: 'user'|'assistant', content: string }]
// Returns the assistant reply string. Throws Error with a `code` on failure.
export async function chatWithAssistant(messages, { lang = 'en' } = {}) {
  let res
  try {
    res = await fetch(proxyEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'assistant',
        lang,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    })
  } catch {
    const err = new Error('network'); err.code = 'failed'; throw err
  }
  if (!res.ok) {
    const err = new Error('request_failed')
    // 503 not_configured → assistant unavailable; everything else → generic
    err.code = res.status === 503 ? 'unavailable' : 'failed'
    throw err
  }
  const data = await res.json()
  return data?.reply || ''
}

// Split an assistant reply into clean text + parsed nav buttons.
// Returns { text, navs: [{ route, label }] }
export function parseAssistantReply(raw) {
  const navs = []
  const text = (raw || '').replace(/\[\[nav:([^|\]]+)\|([^\]]+)\]\]/g, (_m, route, label) => {
    navs.push({ route: route.trim(), label: label.trim() })
    return ''
  }).replace(/\n{3,}/g, '\n\n').trim()
  return { text, navs }
}
