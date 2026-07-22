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

// ── Chat history persistence ───────────────────────────────────────────────
// Conversations are stored in localStorage so the user can pick up where they
// left off. Each entry: { id, ts, messages: [{ role, content }], summary? }
const CHAT_HISTORY_KEY = 'wl_assistant_history'
const MAX_HISTORY = 50          // keep last 50 conversations
const MAX_MSG_PER_CONV = 100    // safety cap per conversation

export function loadChatHistory() {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveChatHistory(history) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)))
  } catch {}
}

export function addMessageToHistory(convId, msg) {
  const all = loadChatHistory()
  const conv = all.find(c => c.id === convId)
  if (conv) {
    conv.messages.push(msg)
    if (conv.messages.length > MAX_MSG_PER_CONV) conv.messages.splice(0, conv.messages.length - MAX_MSG_PER_CONV)
    conv.ts = Date.now()
  }
  saveChatHistory(all)
}

export function createConversation(id) {
  const all = loadChatHistory()
  const conv = { id, ts: Date.now(), messages: [], summary: '' }
  all.push(conv)
  saveChatHistory(all)
  return conv
}

export function clearChatHistory() {
  try { localStorage.removeItem(CHAT_HISTORY_KEY) } catch {}
}

// Canonical feature map — comprehensive list of everything the app can do.
// The assistant uses this to guide users to the right place.
export const FEATURES = [
  // Dashboard & Overview
  { route: '/dashboard',                     label: 'Dashboard',            desc: 'Main overview of your net worth, holdings, and portfolio stats' },
  { route: '/dashboard?tab=overview',        label: 'Portfolio Overview',   desc: 'See your total net worth, allocation, and holdings at a glance' },
  { route: '/dashboard?tab=watchlist',       label: 'Watchlist',            desc: 'Track assets you\'re interested in but don\'t own yet' },

  // Analysis & Intelligence
  { route: '/dashboard?tab=tools&tool=ai',   label: 'Portfolio Analysis',          desc: 'Deep smart analysis of your portfolio with personalized recommendations' },
  { route: '/dashboard?tab=tools&tool=ta',   label: 'Technical Analysis',   desc: 'Technical indicators, momentum, RSI, MACD for your holdings' },
  { route: '/dashboard?tab=tools&tool=risk', label: 'Risk Scanner',         desc: 'Scan for concentration risk, liquidity risk, and volatility exposure' },
  { route: '/technicals',                    label: 'Technicals Page',      desc: 'Full technical analysis dashboard with multi-timeframe indicators' },
  { route: '/alpha',                         label: 'Alpha Signals',        desc: 'Price signals, buy/sell indicators, and on-chain metrics' },
  { route: '/whales',                        label: 'Whale Tracker',        desc: 'Track large transactions and whale movements' },

  // Alerts & Targets
  { route: '/dashboard?tab=alerts',          label: 'Price Alerts',         desc: 'Set price alerts to get notified when assets hit your target levels' },
  { route: '/dashboard?tab=targets',         label: 'Sell Targets',         desc: 'Plan your exits — set multi-level profit targets for each holding' },

  // Transactions & Management
  { route: '/transactions',                  label: 'Transactions',         desc: 'View and manage all your buy/sell transactions' },
  { route: '/dashboard?tab=manage',          label: 'Wallets & Backup',     desc: 'Manage wallets, export data, import portfolios, backup your data' },

  // Learning & Community
  { route: '/academy',                       label: 'Academy',              desc: 'Learn about crypto, investing, and portfolio management' },
  { route: '/coach',                         label: 'Coach',             desc: 'Get personalized portfolio advice and wallet health score' },

  // Tools & Calculators
  { route: '/rebalancing-calculator',        label: 'Rebalancing Tool',     desc: 'Calculate how to rebalance your portfolio for optimal allocation' },
  { route: '/market-index',                  label: 'Market Index',         desc: 'Track overall market performance and indices' },
  { route: '/fear-and-greed-index',          label: 'Fear & Greed Index',   desc: 'See the current market sentiment and fear/greed reading' },

  // Import Methods
  { route: '/dashboard?tab=manage',          label: 'Import from Excel',    desc: 'Import your portfolio from Excel or CSV spreadsheets' },
  { route: '/dashboard?tab=manage',          label: 'Import by Voice',      desc: 'Add holdings by speaking — voice recognition for quick entry' },
  { route: '/dashboard?tab=manage',          label: 'Import Screenshot',    desc: 'Take a screenshot of your exchange and import holdings automatically' },
  { route: '/dashboard?tab=manage',          label: 'Import Backup',        desc: 'Restore your portfolio from a previous backup file' },

  // Settings & Account
  { route: '/settings',                      label: 'Settings',             desc: 'Customize themes, font size, notifications, and app preferences' },

  // Privacy & Legal
  { route: '/privacy',                       label: 'Privacy Policy',       desc: 'Read our privacy policy — your data stays on your device' },
  { route: '/terms',                         label: 'Terms of Service',     desc: 'View terms and conditions' },
  { route: '/faq',                           label: 'FAQ',                  desc: 'Frequently asked questions about WalletLens' },
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
